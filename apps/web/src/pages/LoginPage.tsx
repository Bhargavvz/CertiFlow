// Demo sign-in. Choosing a person still goes through a real login: the server looks
// the user up and sets a signed, httpOnly session cookie. Nothing here grants a role.
import { ROLE_LABELS, type Role } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, ChevronDown, FileClock, Loader2, ScanLine, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { homePathFor, useAuth } from '../auth';
import { Avatar } from '../components/Display';
import { ErrorState, Skeleton } from '../components/Feedback';
import { ROLE_BLURB } from '../components/shell/nav';
import { cn } from '../lib/cn';
import { notifyError } from '../toast';
import type { DemoUser } from '../types';

const MAIN = ['anika', 'dev', 'meera', 'kabir', 'neha', 'farah'];

const roleText: Record<Role, string> = {
  CENTRE: 'text-role-centre',
  DISTRICT_OFFICER: 'text-role-district',
  QUALITY: 'text-role-quality',
  STATE: 'text-role-state',
};

function scopeLine(u: DemoUser): string {
  if (u.centre) return u.centre.name;
  if (u.district) return `${u.district.name} district`;
  return 'All districts';
}

function UserCard({ user, busy, disabled, onPick }: { user: DemoUser; busy: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cn(
        'group relative flex w-full items-start gap-3.5 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-all',
        'hover:-translate-y-px hover:border-primary/50 hover:shadow-md disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0',
      )}
    >
      <Avatar name={user.name} role={user.role} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[0.9375rem] font-semibold text-fg">{user.name}</span>
          {busy ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
          ) : (
            <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
          )}
        </span>
        <span className={cn('mt-0.5 block text-caption font-semibold', roleText[user.role])}>{ROLE_LABELS[user.role]}</span>
        <span className="block truncate text-caption text-muted">{scopeLine(user)}</span>
        <span className="mt-2 block text-caption leading-relaxed text-muted">{ROLE_BLURB[user.role]}</span>
      </span>
      <span className="sr-only">{busy ? 'Signing in…' : `Sign in as ${user.name}`}</span>
    </button>
  );
}

const POINTS = [
  { icon: FileClock, title: 'Days, not weeks', body: 'Centres upload once; officers review in one place; certificates go out automatically.' },
  { icon: ShieldCheck, title: 'Every decision on record', body: 'Who approved, who sent back and why, with a timeline nobody can edit.' },
  { icon: ScanLine, title: 'Verified in seconds', body: 'Employers scan the QR code. Revoked certificates show as revoked, instantly.' },
  { icon: Smartphone, title: 'Straight to the phone', body: 'Candidates get their certificate on WhatsApp, even when the network is flaky.' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const users = useQuery({ queryKey: ['demo-users'], queryFn: () => api<{ users: DemoUser[] }>('/auth/demo-users'), retry: 1 });

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const pick = async (key: string) => {
    setBusy(key);
    try {
      const u = await login(key);
      navigate(homePathFor(u));
    } catch (e) {
      notifyError(e, 'Couldn’t sign in');
    } finally {
      setBusy(null);
    }
  };

  const all = users.data?.users ?? [];
  const main = MAIN.map((k) => all.find((u) => u.key === k)).filter((u): u is DemoUser => !!u);
  const others = all.filter((u) => !MAIN.includes(u.key));

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Product story */}
      <aside className="relative hidden overflow-hidden bg-primary px-10 py-12 text-primary-fg lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-white/[0.04]" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <BadgeCheck className="size-6" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">CertiFlow</span>
            <span className="block text-caption opacity-80">Pragati Skills Mission</span>
          </span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight">Skilling certificates people can trust.</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed opacity-85">
            From a centre’s spreadsheet to a verified certificate on the candidate’s phone, with every decision recorded along the way.
          </p>
          <ul className="mt-8 grid gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/12">
                  <p.icon className="size-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-body opacity-80">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 text-caption opacity-70">A fictional state programme, built for a hackathon demo.</p>
      </aside>

      {/* Role switcher */}
      <main className="flex items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-2xl">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-fg">
              <BadgeCheck className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold tracking-tight text-fg">CertiFlow</span>
              <span className="block text-caption text-muted">Skilling certificates people can trust</span>
            </span>
          </div>

          <h2 className="text-title text-fg">Choose who you are</h2>
          <p className="mt-1 text-body text-muted">
            Demo sign-in: one click, but you still get a real signed session. Switch person any time from the top-right menu.
          </p>

          <div className="mt-6">
            {users.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-[118px] rounded-xl" />
                ))}
              </div>
            ) : users.error ? (
              <ErrorState error={users.error} onRetry={() => void users.refetch()} className="rounded-xl border border-border bg-surface" />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {main.map((u) => (
                    <UserCard key={u.key} user={u} busy={busy === u.key} disabled={busy !== null} onPick={() => void pick(u.key)} />
                  ))}
                </div>
                {others.length > 0 && (
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={() => setShowOthers((v) => !v)}
                      aria-expanded={showOthers}
                      className="inline-flex items-center gap-1.5 rounded text-caption font-medium text-muted hover:text-fg"
                    >
                      <ChevronDown className={cn('size-4 transition-transform', showOthers && 'rotate-180')} aria-hidden />
                      Another district (to see that people only get what’s theirs)
                    </button>
                    {showOthers && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {others.map((u) => (
                          <UserCard key={u.key} user={u} busy={busy === u.key} disabled={busy !== null} onPick={() => void pick(u.key)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-status-green-bg text-status-green-fg">
                <ShieldCheck className="size-[18px]" aria-hidden />
              </span>
              <span>
                <span className="block text-body font-medium text-fg">Checking a certificate?</span>
                <span className="block text-caption text-muted">Anyone can verify one. No account needed.</span>
              </span>
            </span>
            <a href="/verify" className="inline-flex items-center gap-1.5 text-body font-medium text-primary hover:underline">
              Verify a certificate <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
