// Notification centre: recent events on batches this user can see (from the audit
// log via GET /notifications), excluding their own actions. Unread = newer than the
// last time this user opened the panel; that marker lives in this browser only.
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { toneClasses, type Tone } from '../../design/status';
import { cn } from '../../lib/cn';
import { useNotifications } from '../../queries';
import type { NotificationItem } from '../../types';
import { EmptyState, SkeletonBlock } from '../Feedback';
import { RelativeTime } from '../RelativeTime';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/overlays';

const keyFor = (userId: string) => `certiflow.notifications.seen.${userId}`;

function readSeen(userId: string): string {
  try {
    return localStorage.getItem(keyFor(userId)) ?? '';
  } catch {
    return '';
  }
}

function describe(n: NotificationItem): { text: string; tone: Tone } {
  const who = n.actorName ?? 'CertiFlow';
  const c = `“${n.courseName}”`;
  switch (n.action) {
    case 'BATCH_SUBMITTED':
      return { text: `${c} was submitted for review`, tone: 'amber' };
    case 'BATCH_RESUBMITTED':
      return { text: `${c} was resubmitted (approvals reset)`, tone: 'amber' };
    case 'BATCH_APPROVED':
      return { text: `${who} approved ${c}`, tone: 'green' };
    case 'BATCH_FINAL_APPROVED':
      return { text: `${who} gave final approval to ${c}`, tone: 'green' };
    case 'BATCH_SENT_BACK':
      return { text: `${who} sent back ${c}`, tone: 'orange' };
    case 'BATCH_REJECTED':
      return { text: `${who} rejected ${c}`, tone: 'red' };
    case 'APPROVAL_WITHDRAWN':
      return { text: `${who} withdrew their approval of ${c}`, tone: 'orange' };
    case 'SLA_BREACHED':
      return { text: `SLA breached: ${c} has waited too long`, tone: 'red' };
    case 'ISSUANCE_COMPLETED':
      return { text: `Certificates for ${c} have gone out`, tone: 'green' };
    case 'DELIVERIES_RETRIED':
      return { text: `Failed deliveries for ${c} are being retried`, tone: 'blue' };
    case 'CERTIFICATE_REVOKED':
      return { text: `Certificate ${n.certificateNumber ?? ''} in ${c} was revoked`, tone: 'red' };
    default:
      return { text: `${c} was updated`, tone: 'slate' };
  }
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications(!!user);
  const [seen, setSeen] = useState('');

  useEffect(() => {
    if (user) setSeen(readSeen(user.id));
  }, [user]);

  if (!user) return null;
  const items = notifications.data ?? [];
  const unread = items.filter((n) => n.at > seen).length;

  const markAllRead = () => {
    const latest = items[0]?.at ?? new Date().toISOString();
    try {
      localStorage.setItem(keyFor(user.id), latest);
    } catch {
      /* stays unread next visit; harmless */
    }
    setSeen(latest);
  };

  return (
    <DropdownMenu onOpenChange={(open) => !open && unread > 0 && markAllRead()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-status-red-dot px-1 text-[0.625rem] font-bold leading-4 text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold text-fg">Notifications</p>
          {unread > 0 && (
            <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
              <CheckCheck className="size-3.5" aria-hidden /> Mark all read
            </button>
          )}
        </div>
        <div className="relative max-h-[26rem] overflow-y-auto p-1">
          {notifications.isLoading ? (
            <SkeletonBlock className="p-3" />
          ) : items.length === 0 ? (
            <EmptyState title="No notifications yet" description="Decisions, escalations and issuance on your batches show up here." className="py-8" />
          ) : (
            items.map((n) => {
              const d = describe(n);
              const isUnread = n.at > seen;
              return (
                <DropdownMenuItem key={n.id} onSelect={() => navigate(`/batches/${n.batchId}`)} className="items-start gap-3 px-3 py-2.5">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', isUnread ? toneClasses[d.tone].dot : 'bg-transparent')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-body', isUnread ? 'font-medium text-fg' : 'text-muted')}>{d.text}</span>
                    {n.reason && <span className="mt-0.5 block truncate text-caption text-muted">“{n.reason}”</span>}
                    <span className="mt-0.5 block text-caption text-subtle">
                      <RelativeTime iso={n.at} />
                      {isUnread && <span className="sr-only"> (unread)</span>}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
