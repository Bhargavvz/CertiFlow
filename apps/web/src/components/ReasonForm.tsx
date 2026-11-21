import { useState } from 'react';

/** Inline "why?" form for reject / send back / revoke. Reasons are mandatory and audited. */
export function ReasonForm({
  label,
  confirmText,
  danger,
  busy,
  onSubmit,
  onCancel,
}: {
  label: string;
  confirmText: string;
  danger?: boolean;
  busy?: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 5;
  return (
    <form
      className="reason-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(reason.trim());
      }}
    >
      <label>
        {label}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} autoFocus placeholder="At least 5 characters" />
      </label>
      <div className="row">
        <button type="submit" className={danger ? 'btn btn-danger' : 'btn'} disabled={!valid || busy}>
          {confirmText}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
