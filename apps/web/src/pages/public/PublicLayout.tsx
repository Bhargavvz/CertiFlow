import { Languages } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../../design/Brand';
import { useI18n } from '../../i18n';

/** Shell for the no-login pages: brand, language switch, content, privacy footer. */
export function PublicLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { t, toggle } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-4">
          <Link to="/verify" className="rounded-md" aria-label="CertiFlow, Pragati Skills Mission: verify a certificate">
            <Brand subtitle={t('brand.programme')} />
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={t('lang.toggleLabel')}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-caption font-medium text-fg hover:bg-surface-2"
          >
            <Languages className="size-4 text-muted" aria-hidden />
            {t('lang.toggle')}
          </button>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
        {children}
      </main>
      {footer && <footer className="mx-auto w-full max-w-2xl px-4 pb-8">{footer}</footer>}
    </div>
  );
}

/** Plain fetch for public endpoints: returns status + JSON + Retry-After, never throws on HTTP errors. */
export async function publicFetch<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T | null; retryAfter: number | null }> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => null)) as T | null;
  const ra = Number(res.headers.get('retry-after'));
  return { status: res.status, data, retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null };
}
