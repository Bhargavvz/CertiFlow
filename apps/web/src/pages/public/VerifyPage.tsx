// Public verification (no login, mobile-first). Opened by typing a number, scanning
// the QR code, or directly from the QR link (/verify/:number), which checks at once.
import { isValidCertificateNumber, normaliseCertificateNumber } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, FileCheck2, FileX2, HelpCircle, Loader2, Lock, ScanLine, Search, ShieldCheck, ShieldX, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/form';
import { formatDate } from '../../format';
import { useI18n } from '../../i18n';
import { cn } from '../../lib/cn';
import type { PublicCertificate, VerifyResponse } from '../../types';
import { PublicLayout, publicFetch } from './PublicLayout';
import { QrScanner } from './QrScanner';

type Outcome = { kind: 'result'; data: VerifyResponse } | { kind: 'limited'; retryAfter: number } | { kind: 'error' };

async function verify(number: string): Promise<Outcome> {
  try {
    const r = await publicFetch<VerifyResponse>(`/api/v1/public/verify/${encodeURIComponent(number)}`);
    if (r.status === 429) return { kind: 'limited', retryAfter: r.retryAfter ?? 60 };
    if ((r.status === 200 || r.status === 404) && r.data) return { kind: 'result', data: r.data };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

/** Shows the certificate fields; deliberately no phone, IDs, scores or revocation reason. */
function Details({ c }: { c: PublicCertificate }) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    [t('verify.holder'), c.holderName],
    [t('verify.course'), c.courseName],
    [t('verify.centre'), `${c.centreName}, ${c.districtName}`],
    [t('verify.issued'), formatDate(c.issuedOn)],
    ...(c.revokedOn ? ([[t('verify.revokedOn'), formatDate(c.revokedOn)]] as [string, string][]) : []),
    [t('verify.number'), c.certificateNumber],
  ];
  return (
    <dl className="divide-y divide-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6">
          <dt className="text-caption text-muted">{k}</dt>
          <dd className={cn('text-body font-medium text-fg sm:text-right', k === t('verify.number') && 'font-mono')}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Too many checks… try again in 42 seconds", counting down, then retries by itself. */
function RateLimited({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left, onDone]);
  return (
    <div role="alert" className="flex gap-3 rounded-2xl border border-status-amber-dot/40 bg-status-amber-bg p-5 text-status-amber-fg">
      <Timer className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p>{t('verify.rateLimited', { s: Math.max(0, left) })}</p>
    </div>
  );
}

function ResultCard({ outcome, onRetry }: { outcome: Outcome; onRetry: () => void }) {
  const { t } = useI18n();
  if (outcome.kind === 'limited') return <RateLimited seconds={outcome.retryAfter} onDone={onRetry} />;
  if (outcome.kind === 'error') {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-surface p-5 text-body text-fg">
        {t('verify.error')}
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          {t('verify.button')}
        </Button>
      </div>
    );
  }
  const r = outcome.data;
  if (r.result === 'NOT_FOUND') {
    return (
      <section aria-live="polite" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center gap-4 bg-surface-2 px-5 py-5">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-status-slate-bg text-status-slate-fg">
            <HelpCircle className="size-8" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-fg">{t('verify.notFound.title')}</h2>
            <p className="text-body text-muted">{t('verify.notFound.body')}</p>
          </div>
        </div>
        <ul className="flex list-disc flex-col gap-1.5 px-5 py-4 pl-9 text-body text-muted">
          <li>{t('verify.notFound.tip1')}</li>
          <li>{t('verify.notFound.tip2')}</li>
        </ul>
      </section>
    );
  }
  const valid = r.result === 'VALID';
  return (
    <section aria-live="polite" className={cn('overflow-hidden rounded-2xl border-2 bg-surface shadow-md', valid ? 'border-status-green-dot' : 'border-status-red-dot')}>
      <div className={cn('flex items-center gap-4 px-5 py-6', valid ? 'bg-status-green-bg' : 'bg-status-red-bg')}>
        <span className={cn('grid size-16 shrink-0 place-items-center rounded-full text-white shadow-sm', valid ? 'bg-status-green-dot' : 'bg-status-red-dot')}>
          {valid ? <ShieldCheck className="size-9" aria-hidden /> : <ShieldX className="size-9" aria-hidden />}
        </span>
        <div>
          <p className={cn('text-caption font-bold uppercase tracking-widest', valid ? 'text-status-green-fg' : 'text-status-red-fg')}>{valid ? 'VALID' : 'REVOKED'}</p>
          <h2 className={cn('text-xl font-semibold leading-tight', valid ? 'text-status-green-fg' : 'text-status-red-fg')}>
            {valid ? t('verify.valid.title') : t('verify.revoked.title')}
          </h2>
          <p className="mt-1 text-body text-fg">{valid ? t('verify.valid.body') : t('verify.revoked.body')}</p>
        </div>
      </div>
      <div className="px-5 py-1">
        <Details c={r.certificate} />
      </div>
    </section>
  );
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function PdfCheck({ number }: { number: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'checking' | 'match' | 'changed' | 'error'>('idle');
  if (!window.crypto?.subtle) return null; // needs a secure context (https or localhost)

  const check = async (file: File) => {
    setState('checking');
    try {
      const hash = await sha256Hex(file); // computed here; only the hash is sent
      const r = await publicFetch<{ found: boolean; matches?: boolean }>(`/api/v1/public/verify/${encodeURIComponent(number)}/check-hash`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sha256: hash }),
      });
      setState(r.data?.found ? (r.data.matches ? 'match' : 'changed') : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="flex items-center gap-2 font-semibold text-fg">
        <FileCheck2 className="size-4 text-primary" aria-hidden /> {t('verify.pdf.title')}
      </h3>
      <p className="mt-1 text-body text-muted">{t('verify.pdf.body')}</p>
      <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-body font-medium text-fg shadow-sm hover:bg-surface-2 focus-within:outline-2 focus-within:outline-ring">
        {state === 'checking' && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {state === 'checking' ? t('verify.pdf.checking') : t('verify.pdf.choose')}
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void check(f);
            e.target.value = '';
          }}
        />
      </label>
      {(state === 'match' || state === 'changed') && (
        <p role="status" className={cn('mt-3 flex items-start gap-2 rounded-md px-3 py-2 text-body', state === 'match' ? 'bg-status-green-bg text-status-green-fg' : 'bg-status-red-bg text-status-red-fg')}>
          {state === 'match' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <FileX2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {state === 'match' ? t('verify.pdf.match') : t('verify.pdf.changed')}
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="mt-3 text-caption text-status-red-fg">
          {t('verify.error')}
        </p>
      )}
    </section>
  );
}

export default function VerifyPage() {
  const { number: param } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const number = param ? normaliseCertificateNumber(decodeURIComponent(param)) : '';
  const [input, setInput] = useState(number);
  const [touched, setTouched] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => setInput(number), [number]);

  const result = useQuery({
    queryKey: ['verify', number],
    queryFn: () => verify(number),
    enabled: !!number,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const normalised = normaliseCertificateNumber(input);
  const formatOk = isValidCertificateNumber(normalised);
  const showFormatError = touched && input.trim().length > 0 && !formatOk;

  const go = (n: string) => {
    setScanning(false);
    navigate(`/verify/${encodeURIComponent(n)}`);
  };

  return (
    <PublicLayout
      footer={
        <section className="rounded-2xl border border-border bg-surface p-5 text-body">
          <h2 className="flex items-center gap-2 font-semibold text-fg">
            <Lock className="size-4 text-primary" aria-hidden /> {t('verify.privacy.title')}
          </h2>
          <p className="mt-2 flex gap-2 text-muted">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-green-fg" aria-hidden />
            {t('verify.privacy.shows')}
          </p>
          <p className="mt-1.5 flex gap-2 text-muted">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
            {t('verify.privacy.hides')}
          </p>
        </section>
      }
    >
      <h1 className="text-title text-fg sm:text-[1.75rem] sm:leading-9">{t('verify.title')}</h1>
      <p className="mt-1 text-body text-muted">{t('verify.subtitle')}</p>

      <form
        className="mt-6 flex flex-col gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (formatOk) go(normalised);
        }}
      >
        <label htmlFor="cert-number" className="text-body font-medium text-fg">
          {t('verify.inputLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="cert-number"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onBlur={() => setTouched(true)}
            placeholder={t('verify.placeholder')}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-invalid={showFormatError}
            aria-describedby="cert-hint"
            className="h-12 flex-1 font-mono text-base tracking-wide"
          />
          <Button type="submit" size="lg" className="h-12">
            <Search aria-hidden /> {t('verify.button')}
          </Button>
        </div>
        <p id="cert-hint" className={cn('text-caption', showFormatError ? 'text-status-red-fg' : 'text-muted')} role={showFormatError ? 'alert' : undefined}>
          {showFormatError ? t('verify.formatInvalid') : t('verify.formatHint')}
        </p>
      </form>

      <div className="mt-3">
        {scanning ? (
          <QrScanner onResult={go} onClose={() => setScanning(false)} />
        ) : (
          <Button variant="secondary" onClick={() => setScanning(true)} className="w-full sm:w-auto">
            <ScanLine aria-hidden /> {t('verify.scan')}
          </Button>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-5" aria-live="polite">
        {number && result.isFetching && (
          <p role="status" className="flex items-center gap-2 text-body text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t('verify.checking')}
          </p>
        )}
        {number && !result.isFetching && result.data && <ResultCard outcome={result.data} onRetry={() => void result.refetch()} />}
        {number && result.data?.kind === 'result' && result.data.data.result !== 'NOT_FOUND' && <PdfCheck number={number} />}
      </div>
    </PublicLayout>
  );
}
