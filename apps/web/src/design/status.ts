// The one status system. Every badge, dot, progress bar and chart colour for a
// batch, certificate, delivery or verification result comes from here, so the
// meaning of a colour never drifts between screens. Colour is never the only
// signal: each tone also has an icon and a text label.
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  HelpCircle,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { BatchStatus } from '@certiflow/shared';

export type Tone = 'slate' | 'amber' | 'orange' | 'green' | 'red' | 'blue';

export interface StatusStyle {
  tone: Tone;
  label: string;
  icon: LucideIcon;
  /** Animate the icon (in-progress states). Respects prefers-reduced-motion via CSS. */
  spin?: boolean;
}

export const toneClasses: Record<Tone, { badge: string; dot: string; text: string; bar: string }> = {
  slate: { badge: 'bg-status-slate-bg text-status-slate-fg', dot: 'bg-status-slate-dot', text: 'text-status-slate-fg', bar: 'bg-status-slate-dot' },
  amber: { badge: 'bg-status-amber-bg text-status-amber-fg', dot: 'bg-status-amber-dot', text: 'text-status-amber-fg', bar: 'bg-status-amber-dot' },
  orange: { badge: 'bg-status-orange-bg text-status-orange-fg', dot: 'bg-status-orange-dot', text: 'text-status-orange-fg', bar: 'bg-status-orange-dot' },
  green: { badge: 'bg-status-green-bg text-status-green-fg', dot: 'bg-status-green-dot', text: 'text-status-green-fg', bar: 'bg-status-green-dot' },
  red: { badge: 'bg-status-red-bg text-status-red-fg', dot: 'bg-status-red-dot', text: 'text-status-red-fg', bar: 'bg-status-red-dot' },
  blue: { badge: 'bg-status-blue-bg text-status-blue-fg', dot: 'bg-status-blue-dot', text: 'text-status-blue-fg', bar: 'bg-status-blue-dot' },
};

export const batchStatus: Record<BatchStatus, StatusStyle> = {
  DRAFT: { tone: 'slate', label: 'Draft', icon: CircleDashed },
  PENDING_DISTRICT: { tone: 'amber', label: 'With district', icon: Clock3 },
  PENDING_QUALITY: { tone: 'amber', label: 'With quality', icon: Clock3 },
  PENDING_STATE: { tone: 'amber', label: 'With state', icon: Clock3 },
  SENT_BACK: { tone: 'orange', label: 'Sent back', icon: RotateCcw },
  REJECTED: { tone: 'red', label: 'Rejected', icon: XCircle },
  APPROVED: { tone: 'green', label: 'Approved', icon: CheckCircle2 },
  ISSUING: { tone: 'blue', label: 'Issuing', icon: Loader2, spin: true },
  ISSUED: { tone: 'green', label: 'Issued', icon: CheckCircle2 },
  PARTIALLY_ISSUED: { tone: 'orange', label: 'Partly delivered', icon: AlertTriangle },
};

export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'DEAD';
export const deliveryStatus: Record<DeliveryStatus, StatusStyle> = {
  PENDING: { tone: 'slate', label: 'Queued', icon: Clock3 },
  SENT: { tone: 'blue', label: 'Sent', icon: Send },
  DELIVERED: { tone: 'green', label: 'Delivered', icon: CheckCircle2 },
  FAILED: { tone: 'blue', label: 'Retrying', icon: Loader2, spin: true },
  DEAD: { tone: 'red', label: 'Failed', icon: XCircle },
};

export const certificateStatus: Record<'ISSUED' | 'REVOKED', StatusStyle> = {
  ISSUED: { tone: 'green', label: 'Valid', icon: ShieldCheck },
  REVOKED: { tone: 'red', label: 'Revoked', icon: ShieldX },
};

export const verifyResult: Record<'VALID' | 'REVOKED' | 'NOT_FOUND', StatusStyle> = {
  VALID: { tone: 'green', label: 'Valid', icon: ShieldCheck },
  REVOKED: { tone: 'red', label: 'Revoked', icon: ShieldX },
  NOT_FOUND: { tone: 'slate', label: 'Not found', icon: HelpCircle },
};
