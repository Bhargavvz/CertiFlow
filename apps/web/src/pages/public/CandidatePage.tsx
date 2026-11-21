// The page a candidate opens from the WhatsApp message. The token in the URL is the
// only key; an invalid token gets one plain message and no hints.
import { useQuery } from '@tanstack/react-query';
import { Award, Check, Download, Link2Off, Loader2, Share2, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CopyButton } from '../../components/CopyButton';
import { GuillocheBand } from '../../design/Guilloche';
import { Seal } from '../../design/Seal';
import { formatDate } from '../../format';
import { useI18n } from '../../i18n';
import type { CandidateView } from '../../types';
import { PublicLayout, publicFetch } from './PublicLayout';

export default function CandidatePage() {
  const { token = '' } = useParams();
  const { t } = useI18n();
  const [shared, setShared] = useState(false);
  const view = useQuery({
    queryKey: ['candidate', token],
    queryFn: () => publicFetch<CandidateView>(`/api/v1/public/certificates/${encodeURIComponent(token)}`),
    retry: false,
  });

  if (view.isLoading) {
    return (
      <PublicLayout>
        <p role="status" className="flex items-center gap-2 text-body text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> …
        </p>
      </PublicLayout>
    );
  }

  const c = view.data?.status === 200 ? view.data.data : null;
  if (!c) {
    return (
      <PublicLayout>
        <section className="rounded-xl border border-border bg-surface p-8 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
            <Link2Off className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold text-fg">{t('candidate.invalid.title')}</h1>
          <p className="mt-1 text-body text-muted">{t('candidate.invalid.body')}</p>
        </section>
      </PublicLayout>
    );
  }

  const share = async () => {
    const text = `${c.courseName}, certificate ${c.certificateNumber}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Certificate', text, url: c.verifyUrl });
      else {
        await navigator.clipboard.writeText(c.verifyUrl);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const revoked = c.status === 'REVOKED';

  return (
    <PublicLayout>
      {revoked ? (
        <section role="alert" className="rounded-xl border border-status-red-dot/45 border-l-4 border-l-status-red-dot bg-surface p-6">
          <ShieldX className="size-10 text-status-red-fg" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold text-status-red-fg">{t('candidate.revoked.title')}</h1>
          <p className="mt-1 text-body text-fg">{t('candidate.revoked.body')}</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          {/* Opens like the certificate itself: guilloche border, then the seal. */}
          <div className="relative overflow-hidden bg-ink px-6 pb-7 pt-8 text-ink-fg">
            <GuillocheBand className="pointer-events-none absolute inset-x-0 top-0 h-12 w-full text-ink-fg/15" />
            <GuillocheBand className="pointer-events-none absolute inset-x-0 bottom-0 h-12 w-full rotate-180 text-ink-fg/10" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Award className="size-7 text-ink-muted" aria-hidden />
                <h1 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight tracking-tight">{t('candidate.hello', { name: c.firstName })}</h1>
                <p className="mt-1 text-ink-muted">{t('candidate.ready')}</p>
              </div>
              <span className="text-ink-fg">
                <Seal tone="ink" label="PRAGATI SKILLS MISSION ✦ CERTIFIED ✦" size={92} press onDark className="!text-ink-fg" />
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-5 px-6 py-6">
            <div>
              <p className="text-lg font-semibold text-fg">{c.courseName}</p>
              <p className="text-body text-muted">{c.centreName}</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-body">
              <div className="rounded-lg bg-surface-2/70 px-3 py-2">
                <dt className="text-caption text-muted">{t('candidate.issuedOn')}</dt>
                <dd className="font-medium text-fg">{formatDate(c.issuedOn)}</dd>
              </div>
              <div className="rounded-lg bg-surface-2/70 px-3 py-2">
                <dt className="text-caption text-muted">{t('candidate.number')}</dt>
                <dd className="flex items-center gap-1 font-mono text-caption font-medium text-fg">
                  <span className="truncate">{c.certificateNumber}</span>
                  <CopyButton value={c.certificateNumber} label="Copy certificate number" />
                </dd>
              </div>
            </dl>
            {c.downloadPath && (
              <a
                href={c.downloadPath}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary text-[0.9375rem] font-semibold text-primary-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] transition-colors hover:bg-primary-hover"
              >
                <Download className="size-5" aria-hidden /> {t('candidate.download')}
              </a>
            )}
            <button
              type="button"
              onClick={() => void share()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface font-medium text-fg hover:bg-surface-2"
            >
              {shared ? <Check className="size-4 text-status-green-fg" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
              {shared ? t('candidate.shared') : t('candidate.share')}
            </button>
          </div>
          <div className="flex items-center gap-4 border-t border-border bg-surface-2/50 px-6 py-5">
            <img src={c.qrDataUri} alt={`QR code that opens ${c.verifyUrl}`} width={96} height={96} className="size-24 shrink-0 rounded-md bg-white p-1" />
            <p className="text-caption text-muted">{t('candidate.verifyNote')}</p>
          </div>
        </section>
      )}
    </PublicLayout>
  );
}
