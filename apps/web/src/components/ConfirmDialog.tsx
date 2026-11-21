// Confirmation for consequential actions (reject, send back, revoke, retry).
// Can require a typed reason (sent to the server and audited) and/or typing an exact
// value such as the certificate number, so nobody revokes the wrong certificate by accident.
import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { friendlyMessage } from '../api';
import { Button } from './ui/button';
import { Field, Input, Textarea } from './ui/form';
import { Dialog, DialogContent } from './ui/overlays';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  reason?: { label: string; placeholder?: string; minLength?: number; maxLength?: number };
  /** User must type exactly this value (case-insensitive) to enable the button. */
  typeToConfirm?: { value: string; label?: string };
  /** An extra "I understand" checkbox for irreversible actions. */
  acknowledge?: string;
  onConfirm: (reason: string) => Promise<unknown>;
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh form every time it opens.
  useEffect(() => {
    if (p.open) {
      setReason('');
      setTyped('');
      setAck(false);
      setError(null);
    }
  }, [p.open]);

  const min = p.reason?.minLength ?? 5;
  const reasonOk = !p.reason || reason.trim().length >= min;
  const typedOk = !p.typeToConfirm || typed.trim().toUpperCase() === p.typeToConfirm.value.toUpperCase();
  const ackOk = !p.acknowledge || ack;
  const ready = reasonOk && typedOk && ackOk && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await p.onConfirm(reason.trim());
      p.onOpenChange(false);
    } catch (e) {
      // Stay open so the reason the user typed isn't lost.
      setError(friendlyMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={p.open} onOpenChange={(o) => !busy && p.onOpenChange(o)}>
      <DialogContent title={p.title} description={p.description}>
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {p.reason && (
            <Field
              id={`${id}-reason`}
              label={p.reason.label}
              hint={`${reason.trim().length < min ? `At least ${min} characters. ` : ''}Recorded in the audit log and shown to the centre.`}
            >
              <Textarea
                id={`${id}-reason`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={p.reason.placeholder}
                maxLength={p.reason.maxLength ?? 500}
                autoFocus
                required
                aria-describedby={`${id}-reason-hint`}
              />
            </Field>
          )}
          {p.typeToConfirm && (
            <Field
              id={`${id}-typed`}
              label={
                <>
                  {p.typeToConfirm.label ?? 'Type to confirm'}: <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-caption">{p.typeToConfirm.value}</code>
                </>
              }
            >
              <Input
                id={`${id}-typed`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={typed.length > 0 && !typedOk}
              />
            </Field>
          )}
          {p.acknowledge && (
            <label className="flex items-start gap-2.5 rounded-md border border-status-red-dot/30 bg-status-red-bg/50 p-3 text-body text-fg">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[var(--status-red-dot)]" />
              <span>{p.acknowledge}</span>
            </label>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-status-red-bg px-3 py-2 text-body text-status-red-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => p.onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant={p.tone === 'danger' ? 'danger' : 'primary'} disabled={!ready} loading={busy}>
              {p.confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
