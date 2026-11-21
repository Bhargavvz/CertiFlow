// A deliberately unreliable fake of a WhatsApp Business API provider.
//  - POST /messages -> 202 { messageId } after random latency
//  - failure injection: 500s, timeouts (hang past the client's timeout), 429 + Retry-After
//  - Idempotency-Key header: a retried send with the same key returns the original
//    message and never creates a second one
//  - delivery receipt webhook ("delivered"/"failed"), signed with HMAC-SHA256
//  - GET /phones, /phones/:phone/messages and an HTML page to play "the candidate's phone"
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import express, { type Express } from 'express';
import { z } from 'zod';

export interface MockOptions {
  webhookUrl: string;
  webhookSecret: string;
  /** Probabilities, each 0..1 and applied in this order. */
  fail500: number;
  failTimeout: number;
  fail429: number;
  /** Probability that an accepted message later reports "failed" via webhook. */
  webhookFail: number;
  latencyMinMs: number;
  latencyMaxMs: number;
  webhookDelayMs: number;
  /** How long an injected timeout keeps the connection open. */
  hangMs: number;
  random?: () => number;
  /**
   * Where to keep the inbox between restarts (a JSON file on a volume). Without it the
   * inbox is in memory only, which is what the tests want.
   */
  storePath?: string;
}

export interface StoredMessage {
  messageId: string;
  idempotencyKey: string;
  to: string;
  text: string;
  link: string;
  status: 'accepted' | 'delivered' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface MockStats {
  requests: number;
  accepted: number;
  replayed: number;
  injected500: number;
  injectedTimeouts: number;
  injectedTimeoutsAccepted: number;
  injected429: number;
  webhooksSent: number;
  webhookErrors: number;
}

const messageSchema = z
  .object({ to: z.string().regex(/^\+\d{8,15}$/), text: z.string().min(1).max(2000), link: z.string().url() })
  .strict();

const configSchema = z
  .object({
    fail500: z.number().min(0).max(1),
    failTimeout: z.number().min(0).max(1),
    fail429: z.number().min(0).max(1),
    webhookFail: z.number().min(0).max(1),
  })
  .partial()
  .strict();

const emptyStats = (): MockStats => ({
  requests: 0,
  accepted: 0,
  replayed: 0,
  injected500: 0,
  injectedTimeouts: 0,
  injectedTimeoutsAccepted: 0,
  injected429: 0,
  webhooksSent: 0,
  webhookErrors: 0,
});

export function createMockWhatsapp(initial: MockOptions) {
  const opts = { ...initial };
  const rand = opts.random ?? Math.random;
  const byKey = new Map<string, StoredMessage>();
  let stats = emptyStats();
  const timers = new Set<NodeJS.Timeout>();

  // Persistence: a real provider keeps message history (and idempotency keys) across
  // restarts. Load once at start; save at most every 250ms, via temp file + rename so a
  // crash mid-write can't leave a half-written file.
  if (opts.storePath && existsSync(opts.storePath)) {
    try {
      const saved = JSON.parse(readFileSync(opts.storePath, 'utf8')) as StoredMessage[];
      for (const m of saved) byKey.set(m.idempotencyKey, m);
    } catch {
      /* unreadable file: start empty rather than crash the demo */
    }
  }
  let saveTimer: NodeJS.Timeout | null = null;
  const persist = () => {
    if (!opts.storePath || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const file = opts.storePath!;
      const tmp = `${file}.tmp`;
      void mkdir(dirname(file), { recursive: true })
        .then(() => writeFile(tmp, JSON.stringify([...byKey.values()])))
        .then(() => rename(tmp, file))
        .catch(() => undefined);
    }, 250);
  };

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const sleep = (ms: number) => new Promise<void>((resolve) => later(ms, resolve));

  async function postWebhook(msg: StoredMessage, attempt = 1): Promise<void> {
    const body = JSON.stringify({
      messageId: msg.messageId,
      idempotencyKey: msg.idempotencyKey,
      status: msg.status === 'failed' ? 'failed' : 'delivered',
      ...(msg.status === 'failed' ? { reason: 'Handset unreachable' } : {}),
      timestamp: new Date().toISOString(),
    });
    const signature = `sha256=${createHmac('sha256', opts.webhookSecret).update(body).digest('hex')}`;
    try {
      const res = await fetch(opts.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': signature },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`webhook answered ${res.status}`);
      stats.webhooksSent++;
    } catch {
      stats.webhookErrors++;
      // Real providers retry webhooks too.
      if (attempt < 6) later(300 * 2 ** attempt, () => void postWebhook(msg, attempt + 1));
    }
  }

  function accept(key: string, input: z.infer<typeof messageSchema>): StoredMessage {
    const now = new Date().toISOString();
    const msg: StoredMessage = { messageId: `wamid.${randomUUID()}`, idempotencyKey: key, ...input, status: 'accepted', createdAt: now, updatedAt: now };
    byKey.set(key, msg);
    stats.accepted++;
    persist();
    later(opts.webhookDelayMs, () => {
      msg.status = rand() < opts.webhookFail ? 'failed' : 'delivered';
      msg.updatedAt = new Date().toISOString();
      persist();
      void postWebhook(msg);
    });
    return msg;
  }

  const app: Express = express();
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key, Authorization, X-Signature');
    if (_req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/messages', async (req, res) => {
    stats.requests++;
    const key = req.get('idempotency-key');
    if (!key || key.length > 200) return void res.status(400).json({ error: 'Idempotency-Key header is required' });
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'Invalid message', issues: parsed.error.issues });

    await sleep(opts.latencyMinMs + rand() * Math.max(0, opts.latencyMaxMs - opts.latencyMinMs));

    // Same key again (a client retry): return the original, never send twice.
    const existing = byKey.get(key);
    if (existing) {
      stats.replayed++;
      res.setHeader('Idempotent-Replayed', 'true');
      return void res.status(202).json({ messageId: existing.messageId, status: existing.status });
    }

    const roll = rand();
    if (roll < opts.fail500) {
      stats.injected500++;
      return void res.status(500).json({ error: 'Internal provider error (injected)' });
    }
    if (roll < opts.fail500 + opts.failTimeout) {
      stats.injectedTimeouts++;
      // The nastiest real-world case: half of the time the provider DID accept the
      // message, but the response never reaches the client. Only the idempotency
      // key prevents a duplicate when the client retries.
      if (rand() < 0.5) {
        stats.injectedTimeoutsAccepted++;
        accept(key, parsed.data);
      }
      later(opts.hangMs, () => {
        if (!res.headersSent) res.status(504).end();
      });
      return;
    }
    if (roll < opts.fail500 + opts.failTimeout + opts.fail429) {
      stats.injected429++;
      res.setHeader('Retry-After', '1');
      return void res.status(429).json({ error: 'Too many requests (injected)' });
    }

    const msg = accept(key, parsed.data);
    res.status(202).json({ messageId: msg.messageId, status: msg.status });
  });

  // ---- demo / test helpers -------------------------------------------------

  app.get('/phones', (_req, res) => {
    // Per phone: how many messages, how many the handset reported delivered or failed,
    // and the latest text for a chat-list preview.
    interface PhoneSummary { phone: string; count: number; delivered: number; failed: number; lastAt: string; lastText: string }
    const phones = new Map<string, PhoneSummary>();
    for (const m of byKey.values()) {
      const p = phones.get(m.to) ?? { phone: m.to, count: 0, delivered: 0, failed: 0, lastAt: m.createdAt, lastText: m.text };
      p.count++;
      if (m.status === 'delivered') p.delivered++;
      if (m.status === 'failed') p.failed++;
      if (m.createdAt >= p.lastAt) {
        p.lastAt = m.createdAt;
        p.lastText = m.text;
      }
      phones.set(m.to, p);
    }
    res.json({ phones: [...phones.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)) });
  });

  app.get('/phones/:phone/messages', (req, res) => {
    const raw = req.params.phone;
    const matchesPhone = (to: string) => to === raw || to.replace(/^\+/, '') === raw.replace(/^\+/, '');
    const messages = [...byKey.values()].filter((m) => matchesPhone(m.to)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    res.json({ messages });
  });

  app.get('/stats', (_req, res) => {
    res.json({ stats, uniqueMessages: byKey.size, config: { ...opts, webhookSecret: undefined, random: undefined } });
  });

  app.get('/messages/keys', (_req, res) => {
    res.json({ keys: [...byKey.keys()] });
  });

  app.post('/admin/config', (req, res) => {
    Object.assign(opts, configSchema.parse(req.body));
    res.json({ ok: true });
  });

  app.post('/admin/reset', (_req, res) => {
    byKey.clear();
    stats = emptyStats();
    persist();
    res.json({ ok: true });
  });

  app.get('/', (_req, res) => {
    res.type('html').send(PHONE_PAGE);
  });

  return {
    app,
    options: opts,
    messages: byKey,
    get stats() {
      return stats;
    },
    close() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      if (saveTimer) clearTimeout(saveTimer);
    },
  };
}

const PHONE_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock WhatsApp</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#e5ddd5;color:#111}
header{background:#075e54;color:#fff;padding:12px 16px;font-weight:600}
main{display:flex;gap:16px;padding:16px;flex-wrap:wrap}
#phones{background:#fff;min-width:240px;border-radius:8px;overflow:hidden}
#phones button{display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-bottom:1px solid #eee;background:#fff;cursor:pointer}
#phones button:hover{background:#f0f0f0}
#chat{flex:1;min-width:280px}
.msg{background:#dcf8c6;padding:8px 12px;border-radius:8px;margin:8px 0;max-width:560px;word-break:break-word}
small{color:#555}
</style></head>
<body><header>Mock WhatsApp: messages received per phone</header>
<main><div id="phones"></div><div id="chat"><p>Select a phone number.</p></div></main>
<script>
let current=null;
async function load(){
  const r=await fetch('phones');const {phones}=await r.json();
  const el=document.getElementById('phones');el.innerHTML='';
  for(const p of phones){const b=document.createElement('button');b.textContent=p.phone+' ('+p.count+')';b.onclick=()=>{current=p.phone;show()};el.appendChild(b)}
  if(current)show();
}
async function show(){
  const r=await fetch('phones/'+encodeURIComponent(current)+'/messages');const {messages}=await r.json();
  const el=document.getElementById('chat');el.innerHTML='<h3>'+current+'</h3>';
  for(const m of messages){const d=document.createElement('div');d.className='msg';
    const t=document.createElement('div');t.textContent=m.text;d.appendChild(t);
    const a=document.createElement('a');a.href=m.link;a.textContent='Open certificate';d.appendChild(a);
    const s=document.createElement('small');s.textContent=' · '+m.status+' · '+new Date(m.createdAt).toLocaleString();d.appendChild(s);
    el.appendChild(d)}
}
load();setInterval(load,3000);
</script></body></html>`;
