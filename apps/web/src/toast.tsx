// Toasts via sonner. Errors carry a short "Ref" (the server correlation id) with a
// copy action, so a support person can find the exact request in the logs.
import { toast } from 'sonner';
import { ApiError, friendlyMessage } from './api';

type Tone = 'info' | 'success' | 'error';

export function notify(text: string, tone: Tone = 'info', description?: string) {
  if (tone === 'success') toast.success(text, { description });
  else if (tone === 'error') toast.error(text, { description });
  else toast(text, { description });
}

export function notifyError(e: unknown, title?: string) {
  const ref = e instanceof ApiError ? e.correlationId : undefined;
  toast.error(title ?? friendlyMessage(e), {
    description: [title ? friendlyMessage(e) : null, ref ? `Ref: ${ref.slice(0, 13)}` : null].filter(Boolean).join(' · ') || undefined,
    action: ref ? { label: 'Copy ref', onClick: () => void navigator.clipboard?.writeText(ref) } : undefined,
    duration: 8000,
  });
}
