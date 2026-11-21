// Demo sign-in. Choosing a person still goes through a real login: the server looks
// the user up and sets a signed, httpOnly session cookie. Nothing here grants a role.
// People are listed in the order a batch travels, so the screen teaches the workflow.
import { ROLE_LABELS, type Role } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { homePathFor, useAuth } from '../auth';
import { Avatar } from '../components/Display';
import { ErrorState, Skeleton } from '../components/Feedback';
import { Brand } from '../design/Brand';
import { GuillocheBand, GuillocheRosette } from '../design/Guilloche';
import { Seal } from '../design/Seal';
import { cn } from '../lib/cn';
import { notifyError } from '../toast';
import type { DemoUser } from '../types';

const STEPS: { role: Role; title: string; body: string }[] = [
  { role: 'CENTRE', title: 'Training centre prepares the batch', body: 'Uploads the candidate spreadsheet and submits it.' },
  { role: 'DISTRICT_OFFICER', title: 'Two district officers approve', body: 'Two different people must agree before it moves on.' },
  { role: 'QUALITY', title: 'Quality checks large batches', body: 'Batches with 50 or more candidates get an extra look.' },
  { role: 'STATE', title: 'State office gives final approval', body: 'Certificates are issued and sent on WhatsApp.' },
];
const MAIN = new Set(['anika', 'dev', 'meera', 'kabir', 'neha', 'farah']);

function scopeLine(u: DemoUser): string {
  if (u.centre) return u.centre.name;
  if (u.district) return `${u.district.name} district`;
  return 'All districts';
}

function PersonRow({ user, busy, disabled, onPick }: { user: DemoUser; busy: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-[border-color,box-shadow,background-color]',
        'hover:border-primary/40 hover:shadow-md focus-visible:border-primary disabled:cursor-wait disabled:opacity-60',
      )}
    >
      <Avatar name={user.name} role={user.role} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-fg">{user.name}</span>
        <span className="block truncate text-caption text-muted">{scopeLine(user)}</span>
      </span>
      <span className="shrink-0 rounded-md px-2.5 py-1 text-caption font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-fg">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Sign in'}
      </span>
      <span className="sr-only">
        {' '}
        as {user.name}, {ROLE_LABELS[user.role]}
      </span>
    </button>
  );
}

/** A clearly-labelled specimen: shows what CertiFlow issues, not anyone's real data. */
function SpecimenCertificate() {
  return (
    <figure className="relative w-full max-w-sm rotate-[-2deg] rounded-xl bg-[#fbfbfd] p-2 text-[#131a33] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)]">
      <div className="relative overflow-hidden rounded-lg border border-[#24306e]/25 px-6 pb-5 pt-6">
        <GuillocheBand className="pointer-events-none absolute inset-x-0 top-0 h-6 w-full text-[#24306e]/30" />
        <GuillocheBand className="pointer-events-none absolute inset-x-0 bottom-0 h-6 w-full rotate-180 text-[#24306e]/30" />
        <p className="font-display text-[0.8125rem] font-semibold text-[#24306e]">Pragati Skills Mission</p>
        <p className="mt-3 font-display text-2xl font-semibold tracking-tight">Certificate of Completion</p>
        <p className="mt-3 text-[0.8125rem] text-[#566079]">This certifies that</p>
        <p className="font-display text-xl font-semibold">A**** W****</p>
        <p className="mt-2 text-[0.8125rem] text-[#566079]">has completed</p>
        <p className="font-semibold">Electrician Helper</p>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] text-[#566079]">Certificate no.</p>
            <p className="font-mono text-[0.8125rem] font-semibold tracking-wide">PSM-2026-7KQ2M9XHRT4</p>
          </div>
          <Seal tone="ink" label="VERIFIED ✦ PRAGATI SKILLS MISSION ✦ " size={84} />
        </div>
      </div>
      <figcaption className="absolute -top-3 right-5 rounded-md bg-[#24306e] px-2 py-0.5 text-[0.6875rem] font-semibold text-white">Specimen</figcaption>
    </figure>
  );
}

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
  const others = all.filter((u) => !MAIN.has(u.key));

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,11fr)_minmax(0,13fr)]">
      {/* The object CertiFlow exists to produce */}
      <aside className="relative hidden overflow-hidden bg-ink text-ink-fg lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <GuillocheRosette spin className="pointer-events-none absolute -right-40 -top-32 size-[640px] text-ink-fg/[0.07]" strokeWidth={0.5} />
        <GuillocheRosette className="pointer-events-none absolute -bottom-56 -left-48 size-[520px] text-ink-fg/[0.05]" strokeWidth={0.5} />
        <Brand tone="ink" className="relative" />
        <div className="relative flex flex-1 items-center justify-center py-6">
          <SpecimenCertificate />
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-[2rem] font-semibold leading-[2.35rem] tracking-tight text-ink-fg">Certificates that can’t be faked, delivered in days.</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            Every approval is on record, every certificate carries a serial number and QR code, and anyone can check one in seconds.
          </p>
        </div>
      </aside>

      <main className="flex justify-center px-5 py-10 sm:px-10 lg:items-center lg:py-14">
        <div className="w-full max-w-xl">
          <div className="mb-10 lg:hidden">
            <Brand />
          </div>

          <h2 className="text-title text-fg">Choose who to sign in as</h2>
          <p className="mt-1.5 text-[0.9375rem] text-muted">
            This is a demo, so there are no passwords. Each person sees only their own part of the work. Switch any time from your account menu.
          </p>

          {users.isLoading ? (
            <div className="mt-8 flex flex-col gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : users.error ? (
            <ErrorState error={users.error} onRetry={() => void users.refetch()} className="mt-8 rounded-lg border border-border bg-surface" />
          ) : (
            <ol className="mt-8 flex flex-col">
              {STEPS.map((step, i) => {
                const people = all.filter((u) => u.role === step.role && MAIN.has(u.key));
                if (people.length === 0) return null;
                return (
                  <li key={step.role} className="relative grid grid-cols-[2rem_1fr] gap-x-4 pb-7 last:pb-0">
                    {/* The route line joining the steps */}
                    {i < STEPS.length - 1 && <span aria-hidden className="absolute bottom-0 left-[15px] top-9 w-px bg-border-strong" />}
                    <span className="grid size-8 place-items-center rounded-full border border-border-strong bg-surface font-display text-body font-semibold text-fg">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="pt-1 font-display text-[0.9375rem] font-semibold text-fg">{step.title}</p>
                      <p className="text-caption text-muted">{step.body}</p>
                      <div className={cn('mt-3 grid gap-2', people.length > 1 && 'sm:grid-cols-2')}>
                        {people.map((u) => (
                          <PersonRow key={u.key} user={u} busy={busy === u.key} disabled={busy !== null} onPick={() => void pick(u.key)} />
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {others.length > 0 && (
            <div className="mt-8 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => setShowOthers((v) => !v)}
                aria-expanded={showOthers}
                className="inline-flex items-center gap-1.5 rounded text-caption font-medium text-muted hover:text-fg"
              >
                <ChevronDown className={cn('size-4 transition-transform', showOthers && 'rotate-180')} aria-hidden />
                People in another district, to see that nobody gets what isn’t theirs
              </button>
              {showOthers && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {others.map((u) => (
                    <PersonRow key={u.key} user={u} busy={busy === u.key} disabled={busy !== null} onPick={() => void pick(u.key)} />
                  ))}
                </div>
              )}
            </div>
          )}

          <a
            href="/verify"
            className="mt-8 flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-primary/40"
          >
            <span className="grid size-9 place-items-center rounded-md bg-status-green-bg text-status-green-fg">
              <ShieldCheck className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">Checking someone’s certificate?</span>
              <span className="block text-caption text-muted">Verify it without an account.</span>
            </span>
            <span className="text-caption font-semibold text-primary">Verify a certificate</span>
          </a>
        </div>
      </main>
    </div>
  );
}
