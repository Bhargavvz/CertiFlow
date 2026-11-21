// Training centre home: what needs me, then the numbers, then recent activity.
import { ArrowRight, Award, CircleDashed, Clock3, FilePlus2, RotateCcw, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { PageHeader, StatCard } from '../../components/Display';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { StatusBadge } from '../../components/StatusBadge';
import { StepProgress } from '../../components/StepProgress';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { formatNumber, plural } from '../../format';
import { needsQuality } from '../../lib/workflow';
import { useBatches, useMeta, useStats } from '../../queries';
import type { BatchSummary } from '../../types';

function ActionRow({ b }: { b: BatchSummary }) {
  const sentBack = b.status === 'SENT_BACK';
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <span
        className={
          sentBack
            ? 'grid size-9 shrink-0 place-items-center rounded-lg bg-status-orange-bg text-status-orange-fg'
            : 'grid size-9 shrink-0 place-items-center rounded-lg bg-status-slate-bg text-status-slate-fg'
        }
      >
        {sentBack ? <RotateCcw className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link to={`/batches/${b.id}`} className="font-medium text-fg hover:underline">
            {b.courseName}
          </Link>
          <StatusBadge kind="batch" status={b.status} size="sm" />
        </p>
        {sentBack && b.sendBackReason ? (
          <p className="mt-0.5 line-clamp-2 text-caption text-status-orange-fg">“{b.sendBackReason}”</p>
        ) : (
          <p className="mt-0.5 text-caption text-muted">
            {b.candidateCount ? plural(b.candidateCount, 'candidate') : 'No candidates uploaded yet'} · updated <RelativeTime iso={b.updatedAt} />
          </p>
        )}
      </div>
      <Button asChild size="sm" variant={sentBack ? 'primary' : 'secondary'}>
        <Link to={`/batches/${b.id}/prepare`}>
          {sentBack ? (
            <>
              Fix and resubmit <ArrowRight aria-hidden />
            </>
          ) : b.candidateCount ? (
            <>
              Review and submit <ArrowRight aria-hidden />
            </>
          ) : (
            <>
              <Upload aria-hidden /> Upload candidates
            </>
          )}
        </Link>
      </Button>
    </li>
  );
}

export default function CentreDashboard() {
  const { user } = useAuth();
  const stats = useStats();
  const batches = useBatches();
  const meta = useMeta();

  const s = stats.data;
  const inReview = s ? s.batchesByStatus.PENDING_DISTRICT + s.batchesByStatus.PENDING_QUALITY + s.batchesByStatus.PENDING_STATE : 0;
  const all = batches.data ?? [];
  // Sent back first (someone is waiting on us), then drafts, oldest first within each.
  const needsMe = all
    .filter((b) => b.status === 'SENT_BACK' || b.status === 'DRAFT')
    .sort((a, b) => (a.status === b.status ? a.updatedAt.localeCompare(b.updatedAt) : a.status === 'SENT_BACK' ? -1 : 1));
  const recent = all.filter((b) => b.status !== 'DRAFT' && b.status !== 'SENT_BACK').slice(0, 6);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name.split(' ')[0] ?? ''}`}
        description="Your batches from upload to certificates on candidates’ phones."
        actions={
          <Button asChild>
            <Link to="/batches/new">
              <FilePlus2 aria-hidden /> New batch
            </Link>
          </Button>
        }
      />

      {stats.error ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Drafts" value={s?.batchesByStatus.DRAFT ?? 0} icon={CircleDashed} tone="slate" loading={stats.isLoading} hint="Not submitted yet" />
          <StatCard label="In review" value={inReview} icon={Clock3} tone="amber" loading={stats.isLoading} hint={s ? `${formatNumber(s.candidatesInReview)} candidates` : undefined} />
          <StatCard label="Sent back" value={s?.batchesByStatus.SENT_BACK ?? 0} icon={RotateCcw} tone="orange" loading={stats.isLoading} hint="Waiting for your fix" />
          <StatCard label="Issued this month" value={s?.certificates.issuedThisMonth ?? 0} icon={Award} tone="green" loading={stats.isLoading} hint="Certificates" />
          <StatCard
            label="Candidates certified"
            value={s?.certificates.valid ?? 0}
            icon={Award}
            loading={stats.isLoading}
            hint={s && s.certificates.revoked > 0 ? `${s.certificates.revoked} revoked` : 'All time'}
          />
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Needs your action" description="Sent-back batches first: an officer is waiting on your fix." />
          {batches.isLoading ? (
            <SkeletonBlock className="p-5" />
          ) : batches.error ? (
            <ErrorState error={batches.error} onRetry={() => void batches.refetch()} />
          ) : needsMe.length === 0 ? (
            <EmptyState
              title="You’re all caught up"
              description="Nothing is waiting for you. Start a new batch when a course finishes."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/batches/new">
                    <FilePlus2 aria-hidden /> New batch
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {needsMe.map((b) => (
                <ActionRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="In progress"
            description="Where your submitted batches are now."
            actions={
              <Link to="/batches" className="text-caption font-medium text-primary hover:underline">
                All batches
              </Link>
            }
          />
          {batches.isLoading ? (
            <SkeletonBlock className="p-5" />
          ) : recent.length === 0 ? (
            <EmptyState title="Nothing submitted yet" description="Submitted batches show up here with their approval progress." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((b) => (
                <li key={b.id}>
                  <Link to={`/batches/${b.id}`} className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-surface-2/60">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-medium text-fg">{b.courseName}</span>
                      <StatusBadge kind="batch" status={b.status} size="sm" />
                    </span>
                    <span className="flex items-center justify-between gap-3 text-caption text-muted">
                      <StepProgress status={b.status} needsQuality={needsQuality(b.candidateCount, meta.data)} variant="compact" />
                      <RelativeTime iso={b.updatedAt} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
