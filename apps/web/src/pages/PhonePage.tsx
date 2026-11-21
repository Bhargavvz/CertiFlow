import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime } from '../format';

interface PhoneSummary {
  phone: string;
  count: number;
  lastAt: string;
}
interface Message {
  messageId: string;
  text: string;
  link: string;
  status: string;
  createdAt: string;
}

const get = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/mock-whatsapp${path}`);
  if (!res.ok) throw new Error('Mock WhatsApp is not reachable');
  return (await res.json()) as T;
};

/** Demo only: plays the candidate's phone by reading the mock provider's inbox. */
export function PhonePage() {
  const [phone, setPhone] = useState<string | null>(null);
  const phones = useQuery({ queryKey: ['mock-phones'], queryFn: () => get<{ phones: PhoneSummary[] }>('/phones'), refetchInterval: 2000 });
  const messages = useQuery({
    queryKey: ['mock-messages', phone],
    queryFn: () => get<{ messages: Message[] }>(`/phones/${encodeURIComponent(phone!)}/messages`),
    enabled: !!phone,
    refetchInterval: 2000,
  });

  return (
    <main className="page">
      <h1>Mock phone (WhatsApp inbox)</h1>
      <p className="muted">Each candidate should receive exactly one message, however many times the provider failed.</p>
      {phones.error && <p className="error">{(phones.error as Error).message}</p>}
      <div className="phone-layout">
        <ul className="phone-list">
          {(phones.data?.phones ?? []).map((p) => (
            <li key={p.phone}>
              <button className={p.phone === phone ? 'active' : ''} onClick={() => setPhone(p.phone)}>
                {p.phone} <span className={p.count > 1 ? 'chip chip-red' : 'chip chip-green'}>{p.count}</span>
              </button>
            </li>
          ))}
          {phones.data?.phones.length === 0 && <li className="muted">No messages yet.</li>}
        </ul>
        <div className="phone-screen">
          {!phone && <p className="muted">Pick a phone number.</p>}
          {(messages.data?.messages ?? []).map((m) => (
            <div key={m.messageId} className="bubble">
              <p>{m.text}</p>
              <a className="btn btn-small" href={m.link} target="_blank" rel="noreferrer">
                Download certificate
              </a>
              <div className="muted small">
                {formatDateTime(m.createdAt)} · {m.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
