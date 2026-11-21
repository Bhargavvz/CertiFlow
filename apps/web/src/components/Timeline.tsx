// The full story of one batch from the audit log: decisions (who, role, why, when),
// revisions, issuance, deliveries and revocations. Each event shows its correlation
// id (copyable) so support can trace it through logs, jobs and webhooks.
import {
  AlertTriangle,
  Award,
  Ban,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  FilePlus2,
  GitBranch,
  RotateCcw,
  Send,
  ShieldX,
  Siren,
  Undo2,
  Upload,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ROLES, type Role } from '@certiflow/shared';
import { toneClasses, type Tone } from '../design/status';
import { formatDateTime, humanise, plural } from '../format';
import { cn } from '../lib/cn';
import { useTimeline } from '../queries';
import type { TimelineItem } from '../types';
import { CopyButton } from './CopyButton';
import { Avatar } from './Display';
import { EmptyState, ErrorState, SkeletonBlock } from './Feedback';
import { RelativeTime } from './RelativeTime';

type Category = 'centre' | 'decisions' | 'issuance' | 'deliveries' | 'alerts';

interface ActionStyle {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  category: Category;
}

const ACTIONS: Record<string, ActionStyle> = {
  SEEDED: { label: 'Created by the demo seed', icon: CircleDashed, tone: 'slate', category: 'centre' },
  BATCH_CREATED: { label: 'Batch created', icon: FilePlus2, tone: 'slate', category: 'centre' },
  BATCH_UPDATED: { label: 'Course name changed', icon: FilePlus2, tone: 'slate', category: 'centre' },
  CANDIDATES_IMPORTED: { label: 'Candidates uploaded', icon: Upload, tone: 'slate', category: 'centre' },
  BATCH_SUBMITTED: { label: 'Submitted for review', icon: Send, tone: 'amber', category: 'centre' },
  BATCH_RESUBMITTED: { label: 'Resubmitted for review', icon: Send, tone: 'amber', category: 'centre' },
  APPROVALS_SUPERSEDED: { label: 'Earlier approvals reset', icon: Undo2, tone: 'orange', category: 'decisions' },
  BATCH_APPROVED: { label: 'Approved', icon: CheckCircle2, tone: 'green', category: 'decisions' },
  BATCH_FINAL_APPROVED: { label: 'Final approval', icon: CheckCircle2, tone: 'green', category: 'decisions' },
  BATCH_SENT_BACK: { label: 'Sent back to the centre', icon: RotateCcw, tone: 'orange', category: 'decisions' },
  BATCH_REJECTED: { label: 'Rejected', icon: XCircle, tone: 'red', category: 'decisions' },
  APPROVAL_WITHDRAWN: { label: 'Approval withdrawn', icon: Undo2, tone: 'orange', category: 'decisions' },
  SLA_BREACHED: { label: 'SLA breached, escalated to the State office', icon: Siren, tone: 'red', category: 'alerts' },
  ISSUANCE_STARTED: { label: 'Issuing certificates', icon: Award, tone: 'blue', category: 'issuance' },
  CERTIFICATE_ISSUED: { label: 'Certificate issued', icon: Award, tone: 'green', category: 'issuance' },
  ISSUANCE_COMPLETED: { label: 'Issuance finished', icon: Award, tone: 'green', category: 'issuance' },
  DELIVERY_SENT: { label: 'WhatsApp message accepted by provider', icon: Send, tone: 'blue', category: 'deliveries' },
  DELIVERY_DELIVERED: { label: 'WhatsApp message delivered', icon: CheckCircle2, tone: 'green', category: 'deliveries' },
  DELIVERY_DEAD: { label: 'Delivery failed (dead-lettered)', icon: XCircle, tone: 'red', category: 'deliveries' },
  DELIVERY_FAILED_RESENDING: { label: 'Provider reported a failure, resending', icon: AlertTriangle, tone: 'orange', category: 'deliveries' },
  DELIVERY_RETRIED: { label: 'Delivery retried by the State office', icon: RotateCcw, tone: 'blue', category: 'deliveries' },
  DELIVERIES_RETRIED: { label: 'Failed deliveries retried', icon: RotateCcw, tone: 'blue', category: 'deliveries' },
  CERTIFICATE_REVOKED: { label: 'Certificate revoked', icon: ShieldX, tone: 'red', category: 'alerts' },
  CERTIFICATE_DOWNLOADED: { label: 'Certificate downloaded by the candidate', icon: Download, tone: 'slate', category: 'issuance' },
  CERTIFICATE_DOWNLOADED_ADMIN: { label: 'Certificate opened by the State office', icon: Download, tone: 'slate', category: 'issuance' },
};

function styleFor(action: string): ActionStyle {
  return ACTIONS[action] ?? { label: humanise(action), icon: Ban, tone: 'slate', category: 'alerts' };
}

const FILTERS: { id: 'all' | Category; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'centre', label: 'Centre' },
  { id: 'issuance', label: 'Issuance' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'alerts', label: 'Alerts & revocations' },
];

type Entry =
  | { kind: 'event'; item: TimelineItem }
  | { kind: 'group'; action: string; items: TimelineItem[] }
  | { kind: 'revision'; revision: number; resubmission: boolean; reset: number; at: string }
  | { kind: 'attempts'; items: TimelineItem[] };

/** Fold the raw feed into what a person wants to read. */
function buildEntries(items: TimelineItem[], filter: 'all' | Category): Entry[] {
  const audit = items.filter((i) => i.kind === 'audit');
  const attempts = items.filter((i) => i.kind === 'delivery_attempt');
  const out: Entry[] = [];

  for (let i = 0; i < audit.length; i++) {
    const item = audit[i]!;
    const style = styleFor(item.action);

    // Revision separators: every submission starts a new review round.
    if (item.action === 'BATCH_SUBMITTED' || item.action === 'BATCH_RESUBMITTED') {
      const prevReset = audit.slice(0, i).reverse().find((x) => x.action === 'APPROVALS_SUPERSEDED');
      const resubmission = item.action === 'BATCH_RESUBMITTED';
      out.push({
        kind: 'revision',
        revision: Number(item.metadata?.revision ?? 1),
        resubmission,
        reset: resubmission ? Number(prevReset?.metadata?.count ?? 0) : 0,
        at: item.at,
      });
    }
    if (filter !== 'all' && style.category !== filter) continue;

    // Per-certificate / per-delivery events come in runs of dozens: fold each run.
    const last = out[out.length - 1];
    if (item.entityType !== 'BATCH' && last && (last.kind === 'group' || last.kind === 'event') ) {
      const lastAction = last.kind === 'group' ? last.action : last.item.action;
      const lastIsEntity = last.kind === 'group' || last.item.entityType !== 'BATCH';
      if (lastAction === item.action && lastIsEntity) {
        if (last.kind === 'group') last.items.push(item);
        else out[out.length - 1] = { kind: 'group', action: item.action, items: [last.item, item] };
        continue;
      }
    }
    out.push({ kind: 'event', item });
  }

  if (attempts.length > 0 && (filter === 'all' || filter === 'deliveries')) out.push({ kind: 'attempts', items: attempts });
  return out;
}

function Actor({ item }: { item: TimelineItem }) {
  const isPerson = (ROLES as readonly string[]).includes(item.actorRole);
  const label = item.actorName ?? (item.actorRole === 'WHATSAPP_PROVIDER' ? 'WhatsApp provider' : item.actorRole === 'PUBLIC' ? 'Public link' : 'CertiFlow');
  return (
    <span className="inline-flex items-center gap-1.5">
      {isPerson && item.actorName && <Avatar name={item.actorName} role={item.actorRole as Role} size="sm" />}
      <span className="font-medium text-fg">{label}</span>
      {isPerson && <span className="text-muted">({humanise(item.actorRole).toLowerCase()})</span>}
    </span>
  );
}

function Dot({ style }: { style: ActionStyle }) {
  return (
    <span className={cn('absolute -left-[13px] top-0.5 grid size-6 place-items-center rounded-full ring-4 ring-surface', toneClasses[style.tone].badge)}>
      <style.icon className="size-3.5" aria-hidden />
    </span>
  );
}

function Correlation({ id }: { id: string | null }) {
  if (!id || id === 'seed') return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-subtle" title={`Correlation id: ${id}`}>
      <code className="font-mono">ref {id.slice(0, 8)}</code>
      <CopyButton value={id} label="Copy correlation id" className="size-5" />
    </span>
  );
}

function EventRow({ item }: { item: TimelineItem }) {
  const s = styleFor(item.action);
  const meta = item.metadata ?? {};
  const extra =
    item.action === 'CANDIDATES_IMPORTED'
      ? `${plural(Number(meta.imported ?? 0), 'candidate')}${meta.fileName ? ` from ${String(meta.fileName)}` : ''}`
      : item.action === 'BATCH_APPROVED' && meta.districtApprovals
        ? `District approval ${String(meta.districtApprovals)} of 2`
        : item.action === 'ISSUANCE_COMPLETED'
          ? `${String(meta.delivered ?? 0)} delivered, ${String(meta.dead ?? 0)} failed`
          : typeof meta.certificateNumber === 'string'
            ? meta.certificateNumber
            : null;
  return (
    <li className="relative pb-6 pl-6">
      <Dot style={s} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="font-medium text-fg">{s.label}</p>
        <span className="text-caption text-muted">
          <RelativeTime iso={item.at} />
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
        <Actor item={item} />
        {extra && <span className="rounded bg-surface-2 px-1.5 py-px text-muted">{extra}</span>}
        <Correlation id={item.correlationId} />
      </div>
      {item.reason && (
        <blockquote className="mt-2 rounded-md border-l-2 border-status-orange-dot bg-surface-2/70 px-3 py-2 text-body text-fg">“{item.reason}”</blockquote>
      )}
    </li>
  );
}

function GroupRow({ action, items }: { action: string; items: TimelineItem[] }) {
  const [open, setOpen] = useState(false);
  const s = styleFor(action);
  return (
    <li className="relative pb-6 pl-6">
      <Dot style={s} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-medium text-fg">
          {s.label} <span className="tabular text-muted">×{items.length}</span>
        </p>
        <span className="text-caption text-muted">
          <RelativeTime iso={items[0]!.at} /> – <RelativeTime iso={items[items.length - 1]!.at} />
        </span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1 inline-flex items-center gap-1 rounded text-caption font-medium text-primary hover:underline"
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {open ? 'Hide' : 'Show'} each one
      </button>
      {open && (
        <ul className="relative mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-surface-2/40 text-caption">
          {items.map((i, idx) => (
            <li key={idx} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0">
              <span className="font-mono text-fg">{typeof i.metadata?.certificateNumber === 'string' ? i.metadata.certificateNumber : i.entityId.slice(0, 8)}</span>
              <span className="text-muted" title={formatDateTime(i.at)}>
                <RelativeTime iso={i.at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AttemptsRow({ items }: { items: TimelineItem[] }) {
  const [open, setOpen] = useState(false);
  const byOutcome = new Map<string, number>();
  for (const i of items) {
    const o = i.action.replace('DELIVERY_ATTEMPT_', '');
    byOutcome.set(o, (byOutcome.get(o) ?? 0) + 1);
  }
  const failures = items.length - (byOutcome.get('ACCEPTED') ?? 0) - (byOutcome.get('ACCEPTED_REPLAY') ?? 0);
  return (
    <li className="relative pb-2 pl-6">
      <Dot style={{ label: '', icon: Send, tone: failures > 0 ? 'blue' : 'green', category: 'deliveries' }} />
      <p className="font-medium text-fg">{plural(items.length, 'WhatsApp delivery attempt')}</p>
      <p className="mt-1 flex flex-wrap gap-1.5 text-caption">
        {[...byOutcome.entries()].map(([o, n]) => (
          <span key={o} className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
            {humanise(o)}: <span className="tabular text-fg">{n}</span>
          </span>
        ))}
      </p>
      {failures > 0 && (
        <p className="mt-1 text-caption text-muted">
          Failed attempts were retried automatically with backoff. Retries reuse the same idempotency key, so nobody gets two messages.
        </p>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {open ? 'Hide' : 'Show'} every attempt
      </button>
      {open && (
        <ul className="relative mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-surface-2/40 text-caption">
          {items.map((i, idx) => (
            <li key={idx} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border px-3 py-1.5 last:border-0 sm:grid-cols-[10rem_1fr_auto]">
              <span className="font-mono text-fg">{String(i.metadata?.certificateNumber ?? '')}</span>
              <span className="hidden text-muted sm:block">
                #{String(i.metadata?.attemptNo ?? '')} {humanise(i.action.replace('DELIVERY_ATTEMPT_', ''))}
                {i.metadata?.httpStatus ? ` (HTTP ${String(i.metadata.httpStatus)})` : ''}
                {i.reason ? `: ${i.reason}` : ''}
              </span>
              <span className="text-muted" title={formatDateTime(i.at)}>
                <RelativeTime iso={i.at} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Timeline({ batchId }: { batchId: string }) {
  const timeline = useTimeline(batchId);
  const [filter, setFilter] = useState<'all' | Category>('all');
  const entries = useMemo(() => buildEntries(timeline.data ?? [], filter), [timeline.data, filter]);

  if (timeline.isLoading) return <SkeletonBlock lines={5} />;
  if (timeline.error) return <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />;

  return (
    <div>
      <div role="group" aria-label="Filter events" className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'rounded-full border px-3 py-1 text-caption font-medium transition-colors',
              filter === f.id ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border text-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No events of this type yet" />
      ) : (
        <ol className="ml-3 border-l-2 border-border" aria-live="polite">
          {entries.map((e, idx) => {
            if (e.kind === 'revision') {
              return (
                <li key={`rev-${idx}`} className="relative -ml-px mb-5 pl-6">
                  <span className="absolute -left-[13px] top-0 grid size-6 place-items-center rounded-full bg-primary text-primary-fg ring-4 ring-surface">
                    <GitBranch className="size-3.5" aria-hidden />
                  </span>
                  <div className="rounded-lg border border-primary/25 bg-primary-soft/60 px-3 py-2">
                    <p className="text-caption font-semibold uppercase tracking-wide text-primary-soft-fg">Revision {e.revision}</p>
                    <p className="text-caption text-primary-soft-fg/90">
                      {e.resubmission
                        ? `Started ${formatDateTime(e.at)}. ${e.reset > 0 ? `${plural(e.reset, 'earlier decision')} reset` : 'Earlier decisions reset'}: two fresh district approvals needed.`
                        : `First submitted ${formatDateTime(e.at)}.`}
                    </p>
                  </div>
                </li>
              );
            }
            if (e.kind === 'group') return <GroupRow key={`g-${idx}`} action={e.action} items={e.items} />;
            if (e.kind === 'attempts') return <AttemptsRow key="attempts" items={e.items} />;
            return <EventRow key={`e-${idx}`} item={e.item} />;
          })}
        </ol>
      )}
    </div>
  );
}
