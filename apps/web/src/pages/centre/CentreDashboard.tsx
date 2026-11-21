// Training centre home. Order of the page = order of importance: the batch an officer
// is waiting on, then the numbers, then everything else in flight.
import { Award, CircleDashed, Clock3, FilePlus2, RotateCcw, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { PageHeader, StatStrip } from '../../components/Display';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { StatusBadge } from '../../components/StatusBadge';
import { StepProgress } from '../../components/StepProgress';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { formatNumber, plural } from '../../format';
import { needsQuality, whoHasIt } from '../../lib/workflow';
import { useBatches, useMeta, useStats } from '../../queries';
import type { BatchSummary } from '../../types';

function greeting(): string {
  const h = Number(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The most urgent sent-back batch, given the room it deserves. */
function SentBackLead({ b }: { b: BatchSummary }) {
  return (
    <section aria-label="Sent back for changes" className="mb-6 overflow-hidden rounded-xl border border-status-orange-dot/35 bg-surface">
      <div className="flex flex-col gap-5 border-l-4 border-status-orange-dot p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-status-orange-bg text-status-orange-fg">
          <RotateCcw className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold text-status-orange-fg">An officer sent this back</p>
          <h2 className="mt-0.5 text-section text-fg">{b.courseName}</h2>
          {b.sendBackReason && <p className="mt-2 max-w-2xl rounded-md bg-surface-2 px-3 py-2 text-body text-fg">“{b.sendBackReason}”</p>}
          <p className="mt-2 text-caption text-muted">
            {plural(b.candidateCount, 'candidate')}, sent back <RelativeTime iso={b.updatedAt} />
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link to={`/batches/${b.id}/prepare`}>Fix and resubmit</Link>
        </Button>
      </div>
    </section>
  );
}

function ActionRow({ b }: { b: BatchSummary }) {
  const sentBack = b.status === 'SENT_BACK';
  const empty = b.candidateCount === 0;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link to={`/batches/${b.id}`} className="font-semibold text-fg hover:text-primary hover:underline underline-offset-4">
            {b.courseName}
          </Link>
          <StatusBadge kind="batch" status={b.status} size="sm" />
        </p>
        <p className="mt-0.5 text-caption text-muted">
          {sentBack && b.sendBackReason ? (
            <span className="text-status-orange-fg">“{b.sendBackReason}”</span>
          ) : empty ? (
            'No candidates uploaded yet'
          ) : (
            <>
              {plural(b.candidateCount, 'candidate')}, ready to submit
            </>
          )}
        </p>
      </div>
      <span className="text-caption text-muted sm:w-28 sm:text-right">
        <RelativeTime iso={b.updatedAt} />
      </span>
      <Button asChild size="sm" variant={sentBack ? 'primary' : 'secondary'} className="sm:w-40">
        <Link to={`/batches/${b.id}/prepare`}>
          {sentBack ? (
            'Fix and resubmit'
          ) : empty ? (
            <>
              <Upload aria-hidden /> Upload candidates
            </>
          ) : (
            'Review and submit'
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
  const sentBack = all.filter((b) => b.status === 'SENT_BACK').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const drafts = all.filter((b) => b.status === 'DRAFT').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const lead = sentBack[0];
  const actionRows = [...sentBack.slice(1), ...drafts];
  const inFlight = all.filter((b) => b.status !== 'DRAFT' && b.status !== 'SENT_BACK').slice(0, 7);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(' ')[0] ?? ''}`}
        description="Your centre’s batches, from spreadsheet to certificates on candidates’ phones."
        breadcrumb={[{ label: 'Dashboard' }]}
        actions={
          <Button asChild size="lg">
            <Link to="/batches/new">
              <FilePlus2 aria-hidden /> New batch
            </Link>
          </Button>
        }
      />

      {lead && <SentBackLead b={lead} />}

      {stats.error ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        <StatStrip
          loading={stats.isLoading}
          stats={[
            { label: 'Drafts', value: s?.batchesByStatus.DRAFT ?? 0, icon: CircleDashed, tone: 'slate', hint: 'Not submitted yet' },
            { label: 'In review', value: inReview, icon: Clock3, tone: 'amber', hint: s ? `${formatNumber(s.candidatesInReview)} candidates waiting` : undefined },
            { label: 'Sent back', value: s?.batchesByStatus.SENT_BACK ?? 0, icon: RotateCcw, tone: 'orange', hint: 'Waiting for your fix' },
            { label: 'Issued this month', value: s?.certificates.issuedThisMonth ?? 0, icon: Award, tone: 'green', hint: 'Certificates' },
            {
              label: 'Candidates certified',
              value: s?.certificates.valid ?? 0,
              icon: Award,
              hint: s && s.certificates.revoked > 0 ? `${s.certificates.revoked} revoked` : 'All time',
            },
          ]}
        />
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card>
          <CardHeader title="Waiting on you" description={lead ? 'Other batches you can finish now.' : 'Batches you can finish now.'} />
          {batches.isLoading ? (
            <SkeletonBlock className="px-5 pb-5" />
          ) : batches.error ? (
            <ErrorState error={batches.error} onRetry={() => void batches.refetch()} />
          ) : actionRows.length === 0 ? (
            <EmptyState
              title={lead ? 'Nothing else to finish' : 'You’re all caught up'}
              description="When a course finishes, create a batch and upload its candidates."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/batches/new">
                    <FilePlus2 aria-hidden /> New batch
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {actionRows.map((b) => (
                <ActionRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="In progress"
            description="Submitted batches and who has them."
            actions={
              <Link to="/batches" className="text-caption font-semibold text-primary hover:underline underline-offset-4">
                All batches
              </Link>
            }
          />
          {batches.isLoading ? (
            <SkeletonBlock className="px-5 pb-5" />
          ) : inFlight.length === 0 ? (
            <EmptyState title="Nothing submitted yet" description="Once you submit a batch, you can follow it through each approval here." />
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {inFlight.map((b) => (
                <li key={b.id}>
                  <Link to={`/batches/${b.id}`} className="block px-5 py-3.5 transition-colors hover:bg-primary-soft/40">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate font-semibold text-fg">{b.courseName}</span>
                      <StatusBadge kind="batch" status={b.status} size="sm" />
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-3">
                      <StepProgress status={b.status} needsQuality={needsQuality(b.candidateCount, meta.data)} variant="compact" />
                      <span className="truncate text-caption text-muted">
                        {b.status.startsWith('PENDING') ? `With ${whoHasIt(b.status, b.district.name).toLowerCase()}` : <RelativeTime iso={b.updatedAt} />}
                      </span>
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
