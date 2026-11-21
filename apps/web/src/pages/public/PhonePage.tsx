// Demo only: the candidate's side of the story. Reads the fake WhatsApp provider's
// inbox (kept on a volume, so it survives restarts) and shows it on a phone.
// The point it proves: every candidate gets exactly one delivered certificate,
// however flaky the provider was along the way.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BatteryFull, Check, CheckCheck, CircleAlert, MessageSquareDashed, Search, ShieldCheck, Signal, Wifi, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatStrip } from '../../components/Display';
import { ErrorState, Skeleton } from '../../components/Feedback';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/form';
import { Brand, BrandMark } from '../../design/Brand';
import { GuillocheBand } from '../../design/Guilloche';
import { formatNumber } from '../../format';
import { cn } from '../../lib/cn';

interface PhoneSummary {
  phone: string;
  count: number;
  delivered: number;
  failed: number;
  lastAt: string;
  lastText: string;
}
interface Message {
  messageId: string;
  text: string;
  link: string;
  status: 'accepted' | 'delivered' | 'failed';
  createdAt: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/mock-whatsapp${path}`, { cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) {
    // Local dev without nginx: talk to the mock directly. Never on https (mixed content).
    const direct = location.hostname === 'localhost' ? await fetch(`http://localhost:4000${path}`).catch(() => null) : null;
    if (direct && direct.ok) return (await direct.json()) as T;
    throw new Error('The demo WhatsApp service isn’t reachable right now.');
  }
  return (await res.json()) as T;
}

const IST = { timeZone: 'Asia/Kolkata' } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { ...IST, hour: 'numeric', minute: '2-digit' });
function dayLabel(iso: string): string {
  const d = new Date(iso).toLocaleDateString('en-IN', IST);
  const today = new Date().toLocaleDateString('en-IN', IST);
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-IN', IST);
  return d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(iso).toLocaleDateString('en-IN', { ...IST, day: 'numeric', month: 'short', year: 'numeric' });
}

/** Pulls the structured bits out of CertiFlow's message text for the link card. */
function parseCertificateMessage(text: string) {
  return {
    firstName: /Congratulations ([^!]+)!/.exec(text)?.[1] ?? null,
    number: /PSM-\d{4}-[0-9A-Z]{11}/.exec(text)?.[0] ?? null,
    course: /for ["“]([^"”]+)["”]/.exec(text)?.[1] ?? null,
  };
}

/** "+919810200003" -> "+91 98102 00003", how a phone shows it. */
function prettyPhone(p: string) {
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}

function Ticks({ status }: { status: Message['status'] }) {
  if (status === 'failed') return <CircleAlert className="size-3.5 text-[#d64545]" aria-label="not delivered" />;
  if (status === 'delivered') return <CheckCheck className="size-4 text-[#53bdeb]" aria-label="delivered" />;
  return <Check className="size-3.5 text-[#8696a0]" aria-label="sent" />;
}

/** Message text with any URL turned into a tappable link. */
function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+?)(?=\s|$|\s\.)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-[#027eb5] underline decoration-[#027eb5]/40 underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part.replace(/\s\.\s/g, ' ')}</Fragment>
        ),
      )}
    </>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const info = parseCertificateMessage(m.text);
  const failed = m.status === 'failed';
  return (
    <div className="max-w-[88%] self-start">
      <div className={cn('overflow-hidden rounded-xl rounded-tl-sm bg-white text-[0.8125rem] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]', failed && 'opacity-60')}>
        {/* Link preview card, as WhatsApp shows for a URL */}
        <a href={m.link} target="_blank" rel="noreferrer" className="block bg-[#f0f2f5] transition-colors hover:bg-[#e9edef]">
          <div className="relative overflow-hidden bg-[#24306e] px-3 py-3 text-white">
            <GuillocheBand className="pointer-events-none absolute inset-x-0 top-0 h-8 w-full text-white/20" />
            <div className="relative flex items-center gap-2.5">
              <span className="text-white">
                <BrandMark className="size-8" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[0.6875rem] text-white/75">Certificate of completion</span>
                <span className="block truncate font-display text-[0.9375rem] font-semibold">{info.course ?? 'Your certificate'}</span>
              </span>
            </div>
          </div>
          <div className="px-3 py-2">
            <span className="block font-semibold text-[#111b21]">Open my certificate</span>
            {info.number && <span className="block truncate font-mono text-[0.6875rem] text-[#3b4a54]">{info.number}</span>}
            <span className="block truncate text-[0.6875rem] text-[#667781]">{new URL(m.link).host}</span>
          </div>
        </a>
        <p className="whitespace-pre-wrap break-words px-3 pb-1 pt-2">
          <LinkedText text={m.text} />
        </p>
        <span className="flex items-center justify-end gap-1 px-3 pb-1.5 text-[0.6875rem] text-[#667781]">
          {failed && <span className="mr-auto text-[#d64545]">Not delivered</span>}
          {time(m.createdAt)} <Ticks status={m.status} />
        </span>
      </div>
    </div>
  );
}

function PhoneDevice({ phone, onBack, messages, loading }: { phone: string | null; onBack: () => void; messages: Message[]; loading: boolean }) {
  // Phone status bars show the clock without am/pm.
  const now = time(new Date().toISOString()).replace(/\s?[ap]m$/i, '');
  // Group by day for the date chips.
  const groups: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(m);
    else groups.push({ day, items: [m] });
  }

  return (
    <div className="relative mx-auto w-full max-w-[360px] rounded-[3rem] bg-[#15171c] p-3 shadow-[0_40px_80px_-30px_rgba(10,15,35,0.6),inset_0_0_0_1.5px_rgba(255,255,255,0.08)]">
      <div className="relative overflow-hidden rounded-[2.4rem] bg-[#efeae2]">
        {/* Status bar */}
        <div className="relative flex h-9 items-center justify-between bg-[#075e54] px-6 text-[0.75rem] font-semibold text-white">
          <span className="tabular">{now}</span>
          <span aria-hidden className="absolute left-1/2 top-1.5 h-5 w-24 -translate-x-1/2 rounded-full bg-[#15171c]" />
          <span className="flex items-center gap-1" aria-hidden>
            <Signal className="size-3.5" />
            <Wifi className="size-3.5" />
            <BatteryFull className="size-4" />
          </span>
        </div>
        {/* Chat header */}
        <div className="flex items-center gap-2.5 bg-[#075e54] px-3 pb-2.5 pt-1 text-white">
          <button type="button" onClick={onBack} className="rounded-full p-1 md:hidden" aria-label="Back to the chat list">
            <ArrowLeft className="size-5" />
          </button>
          <span className="grid size-9 place-items-center rounded-full bg-white text-[#24306e]">
            <BrandMark className="size-9 bg-transparent ring-0" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1 text-[0.875rem] font-semibold">
              Pragati Skills Mission <ShieldCheck className="size-3.5 text-[#25d366]" aria-label="verified business" />
            </span>
            <span className="block truncate text-[0.6875rem] text-white/75">{phone ? `To ${prettyPhone(phone)}` : 'Official account'}</span>
          </span>
        </div>
        {/* Chat */}
        <div
          className="relative flex h-[34rem] flex-col gap-2 overflow-y-auto px-3 py-3"
          style={{
            // WhatsApp-style doodle wallpaper, drawn with two faint dot grids.
            backgroundImage: 'radial-gradient(rgba(17,27,33,0.05) 1px, transparent 1px), radial-gradient(rgba(17,27,33,0.035) 1px, transparent 1px)',
            backgroundSize: '18px 18px, 18px 18px',
            backgroundPosition: '0 0, 9px 9px',
          }}
          aria-live="polite"
          aria-label={phone ? `Messages to ${phone}` : 'No chat selected'}
        >
          {!phone ? (
            <p className="m-auto max-w-[14rem] rounded-lg bg-[#fff8c5] px-3 py-2 text-center text-[0.75rem] text-[#54656f] shadow-sm">
              Pick a candidate’s number to open their chat.
            </p>
          ) : loading ? (
            <Skeleton className="h-40 w-4/5 rounded-xl bg-white/70" />
          ) : messages.length === 0 ? (
            <p className="m-auto text-[0.75rem] text-[#54656f]">No messages yet.</p>
          ) : (
            <>
              <p className="mx-auto rounded-lg bg-[#fff8c5] px-3 py-1.5 text-center text-[0.6875rem] leading-snug text-[#54656f] shadow-sm">
                Messages from this business are sent by CertiFlow on behalf of the Pragati Skills Mission.
              </p>
              {groups.map((g) => (
                <Fragment key={g.day}>
                  <span className="mx-auto my-1 rounded-md bg-white/90 px-2.5 py-0.5 text-[0.6875rem] font-medium text-[#54656f] shadow-sm">{g.day}</span>
                  {g.items.map((m) => (
                    <MessageBubble key={m.messageId} m={m} />
                  ))}
                </Fragment>
              ))}
            </>
          )}
        </div>
        {/* Composer, inert: candidates only receive here */}
        <div className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2" aria-hidden>
          <span className="h-9 flex-1 rounded-full bg-white px-4 text-[0.8125rem] leading-9 text-[#8696a0]">Message</span>
          <span className="grid size-9 place-items-center rounded-full bg-[#00a884] text-white">
            <MessageSquareDashed className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PhonePage() {
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Wide screens show list and phone side by side, so open the newest chat by default.
  const [wide] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const phones = useQuery({ queryKey: ['mock-phones'], queryFn: () => get<{ phones: PhoneSummary[] }>('/phones'), refetchInterval: 2000 });
  const phone = picked ?? (wide ? (phones.data?.phones[0]?.phone ?? null) : null);
  const setPhone = setPicked;
  const messages = useQuery({
    queryKey: ['mock-messages', phone],
    queryFn: () => get<{ messages: Message[] }>(`/phones/${encodeURIComponent(phone!)}/messages`),
    enabled: !!phone,
    refetchInterval: 2000,
  });
  const list = useMemo(() => phones.data?.phones ?? [], [phones.data]);
  const shown = useMemo(() => {
    const q = query.replace(/\s/g, '');
    return q ? list.filter((p) => p.phone.includes(q) || (parseCertificateMessage(p.lastText).firstName ?? '').toLowerCase().includes(query.toLowerCase())) : list;
  }, [list, query]);

  // A real duplicate is two DELIVERED certificate messages to one phone. A message the
  // handset rejected, followed by one resend that arrived, is the system working.
  const totals = list.reduce(
    (a, p) => ({ messages: a.messages + p.count, delivered: a.delivered + p.delivered, resent: a.resent + (p.failed > 0 ? 1 : 0), duplicates: a.duplicates + (p.delivered > 1 ? 1 : 0) }),
    { messages: 0, delivered: 0, resent: 0, duplicates: 0 },
  );

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand subtitle="Candidate phone (demo)" />
          <Link to="/verify" className="text-caption font-semibold text-primary hover:underline underline-offset-4">
            Verify a certificate
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-7 max-w-2xl">
          <h1 className="text-title text-fg">What candidates receive</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">
            This is the inbox of the demo WhatsApp provider, which fails on purpose (errors, timeouts, rate limits). Each candidate should still end up with
            exactly one delivered certificate.
          </p>
        </div>

        {phones.error ? (
          <ErrorState error={phones.error} onRetry={() => void phones.refetch()} />
        ) : (
          <>
            <StatStrip
              className="mb-6"
              loading={phones.isLoading}
              stats={[
                { label: 'Candidates messaged', value: formatNumber(list.length) },
                { label: 'Certificates delivered', value: formatNumber(totals.delivered), hint: `${formatNumber(totals.messages)} messages in total` },
                {
                  label: 'Resent after a failure',
                  value: formatNumber(totals.resent),
                  hint: 'The phone rejected the first try; one new message was sent',
                },
                {
                  label: 'Duplicates',
                  value: formatNumber(totals.duplicates),
                  tone: totals.duplicates ? 'red' : 'green',
                  icon: totals.duplicates ? X : Check,
                  hint: totals.duplicates ? 'Someone got the certificate twice' : 'Nobody got it twice',
                },
              ]}
            />

            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_380px] lg:grid-cols-[minmax(0,1fr)_400px]">
              {/* Chat list */}
              <section aria-label="Candidate phones" className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-surface', phone && 'max-md:hidden')}>
                <div className="border-b border-border p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by number or first name" aria-label="Search phones" className="pl-8" />
                  </div>
                </div>
                {phones.isLoading ? (
                  <div className="flex flex-col gap-2 p-3">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Skeleton key={i} className="h-14" />
                    ))}
                  </div>
                ) : list.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <span className="mx-auto mb-3 grid size-11 place-items-center rounded-lg bg-primary-soft text-primary-soft-fg">
                      <MessageSquareDashed className="size-5" aria-hidden />
                    </span>
                    <p className="text-section text-fg">No certificates sent yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-body text-muted">
                      Sign in as Farah (State office) and give a batch final approval. Each candidate’s message appears here within a few seconds.
                    </p>
                    <Button asChild variant="secondary" size="sm" className="mt-4">
                      <Link to="/login">Go to sign-in</Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="relative max-h-[38rem] divide-y divide-border overflow-y-auto">
                    {shown.map((p) => {
                      const info = parseCertificateMessage(p.lastText);
                      const dup = p.delivered > 1;
                      return (
                        <li key={p.phone}>
                          <button
                            type="button"
                            onClick={() => setPhone(p.phone)}
                            aria-current={phone === p.phone ? 'true' : undefined}
                            className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', phone === p.phone ? 'bg-primary-soft/70' : 'hover:bg-surface-2/70')}
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-body font-semibold text-muted" aria-hidden>
                              {(info.firstName ?? '?').slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="truncate font-semibold text-fg">{info.firstName ?? prettyPhone(p.phone)}</span>
                                <span className="shrink-0 text-micro text-muted">{time(p.lastAt)}</span>
                              </span>
                              <span className="block truncate font-mono text-caption text-muted">{prettyPhone(p.phone)}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-caption">
                                {dup ? (
                                  <span className="font-semibold text-status-red-fg">Delivered {p.delivered} times</span>
                                ) : p.delivered ? (
                                  <span className="inline-flex items-center gap-1 text-status-green-fg">
                                    <CheckCheck className="size-3.5" aria-hidden /> Delivered
                                  </span>
                                ) : (
                                  <span className="text-muted">Sending…</span>
                                )}
                                {p.failed > 0 && <span className="text-muted">after {p.failed} failed {p.failed === 1 ? 'try' : 'tries'}</span>}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {shown.length === 0 && <li className="px-4 py-8 text-center text-body text-muted">No phone matches “{query}”.</li>}
                  </ul>
                )}
              </section>

              {/* The phone */}
              <div className={cn(!phone && 'max-md:hidden')}>
                <PhoneDevice phone={phone} onBack={() => setPhone(null)} messages={messages.data?.messages ?? []} loading={messages.isLoading} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
