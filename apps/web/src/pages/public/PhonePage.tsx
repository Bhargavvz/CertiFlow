// Demo only: a phone frame showing the mock WhatsApp provider's inbox per number.
// Each candidate should get exactly one message, however flaky the provider was.
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState } from '../../components/Feedback';
import { cn } from '../../lib/cn';

interface PhoneSummary {
  phone: string;
  count: number;
  lastAt: string;
}
interface Message {
  messageId: string;
  text: string;
  link: string;
  status: 'accepted' | 'delivered' | 'failed';
  createdAt: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/mock-whatsapp${path}`).catch(() => null);
  if (!res || !res.ok) {
    const direct = await fetch(`http://localhost:4000${path}`).catch(() => null);
    if (direct && direct.ok) return (await direct.json()) as T;
    throw new Error('The mock WhatsApp service is not reachable.');
  }
  return (await res.json()) as T;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });

function Ticks({ status }: { status: Message['status'] }) {
  if (status === 'failed') return <X className="size-3.5 text-[#d64545]" aria-label="failed" />;
  if (status === 'delivered') return <CheckCheck className="size-3.5 text-[#53bdeb]" aria-label="delivered" />;
  return <Check className="size-3.5 text-[#8696a0]" aria-label="sent" />;
}

export default function PhonePage() {
  const [phone, setPhone] = useState<string | null>(null);
  const phones = useQuery({ queryKey: ['mock-phones'], queryFn: () => get<{ phones: PhoneSummary[] }>('/phones'), refetchInterval: 2000 });
  const messages = useQuery({
    queryKey: ['mock-messages', phone],
    queryFn: () => get<{ messages: Message[] }>(`/phones/${encodeURIComponent(phone!)}/messages`),
    enabled: !!phone,
    refetchInterval: 2000,
  });
  const list = phones.data?.phones ?? [];

  // On wide screens, open the newest conversation automatically.
  useEffect(() => {
    if (!phone && list[0] && window.matchMedia('(min-width: 768px)').matches) setPhone(list[0].phone);
  }, [phone, list]);

  const duplicates = list.filter((p) => p.count > 1).length;

  return (
    <div className="min-h-dvh bg-bg px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-title text-fg">
            <Smartphone className="size-6 text-primary" aria-hidden /> Mock phone
          </h1>
          <p className="mt-1 max-w-2xl text-body text-muted">
            What candidates receive from the (fake, deliberately unreliable) WhatsApp provider. Each phone should show exactly one certificate message.
            {list.length > 0 && (
              <>
                {' '}
                <span className={duplicates ? 'font-medium text-status-red-fg' : 'font-medium text-status-green-fg'}>
                  {list.length} phones · {duplicates ? `${duplicates} with more than one message` : 'no duplicates'}
                </span>
              </>
            )}
          </p>
        </header>

        {phones.error ? (
          <ErrorState error={phones.error} onRetry={() => void phones.refetch()} />
        ) : (
          <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
            <nav aria-label="Phone numbers" className={cn('overflow-hidden rounded-xl border border-border bg-surface', phone && 'hidden md:block')}>
              {list.length === 0 ? (
                <EmptyState title="No messages yet" description="Give a batch final approval and watch messages arrive here." />
              ) : (
                <ul className="max-h-[36rem] divide-y divide-border overflow-y-auto">
                  {list.map((p) => (
                    <li key={p.phone}>
                      <button
                        type="button"
                        onClick={() => setPhone(p.phone)}
                        aria-current={phone === p.phone ? 'true' : undefined}
                        className={cn('flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors', phone === p.phone ? 'bg-primary-soft' : 'hover:bg-surface-2')}
                      >
                        <span className="font-mono text-body text-fg">{p.phone}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-caption font-semibold tabular',
                            p.count > 1 ? 'bg-status-red-bg text-status-red-fg' : 'bg-status-green-bg text-status-green-fg',
                          )}
                          title={p.count > 1 ? 'More than one message' : 'Exactly one message'}
                        >
                          {p.count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>

            {/* Phone frame */}
            <div className={cn('mx-auto w-full max-w-sm', !phone && 'hidden md:block')}>
              <div className="rounded-[2.5rem] border-[10px] border-[#1c1f24] bg-[#1c1f24] shadow-lg">
                <div className="overflow-hidden rounded-[1.9rem]">
                  <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
                    <button type="button" onClick={() => setPhone(null)} className="md:hidden" aria-label="Back to phone list">
                      <ArrowLeft className="size-5" />
                    </button>
                    <span className="grid size-9 place-items-center rounded-full bg-white/20 text-caption font-semibold">PSM</span>
                    <span className="leading-tight">
                      <span className="block text-body font-semibold">Pragati Skills Mission</span>
                      <span className="block text-[0.6875rem] opacity-80">{phone ?? 'Pick a number'}</span>
                    </span>
                  </div>
                  <div
                    className="flex h-[30rem] flex-col gap-2 overflow-y-auto bg-[#efeae2] px-3 py-4"
                    aria-live="polite"
                    aria-label={phone ? `Messages to ${phone}` : undefined}
                  >
                    {!phone ? (
                      <p className="m-auto text-caption text-[#54656f]">Choose a phone number to see its messages.</p>
                    ) : (messages.data?.messages ?? []).length === 0 ? (
                      <p className="m-auto text-caption text-[#54656f]">No messages yet.</p>
                    ) : (
                      messages.data!.messages.map((m) => (
                        <div key={m.messageId} className="max-w-[85%] self-start rounded-lg rounded-tl-none bg-white px-3 py-2 text-[0.8125rem] leading-snug text-[#111b21] shadow-sm">
                          <p className="whitespace-pre-wrap break-words">{m.text.split(m.link)[0]}</p>
                          <a href={m.link} target="_blank" rel="noreferrer" className="mt-2 block rounded-md bg-[#f0f2f5] px-3 py-2 text-center font-medium text-[#027eb5]">
                            Open my certificate
                          </a>
                          <span className="mt-1 flex items-center justify-end gap-1 text-[0.6875rem] text-[#667781]">
                            {time(m.createdAt)} <Ticks status={m.status} />
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              {phone && (
                <p className="mt-3 text-center">
                  <Link to="/verify" className="text-caption text-primary hover:underline">
                    Open the public verify page
                  </Link>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
