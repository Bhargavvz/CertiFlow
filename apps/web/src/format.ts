/** All times are stored in UTC and shown in India Standard Time. */
const IST = 'Asia/Kolkata';

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  // Date-only values (YYYY-MM-DD) are calendar dates, not instants: don't shift them.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString('en-IN', { timeZone: IST, dateStyle: 'medium' });
}

/** Compact duration: 45s, 12m, 5h 20m, 3d 4h. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-IN');
}

/** "BATCH_SENT_BACK" -> "Batch sent back" */
export function humanise(code: string): string {
  return code.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** +919812300001 -> +91 98•••••001. Officers see full numbers on the review page; previews don't need them. */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return '•••';
  return `${phone.slice(0, 3)} ${phone.slice(3, 5)}${'•'.repeat(phone.length - 8)}${phone.slice(-3)}`;
}

/** Plural helper: plural(3, 'row') -> "3 rows". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
