import { ROLE_LABELS } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { homePathFor, useAuth } from '../auth';
import { useToast } from '../toast';
import type { DemoUser } from '../types';

const MAIN_DEMO = ['anika', 'dev', 'meera', 'kabir', 'neha', 'farah'];

/**
 * Demo role switcher. Picking a user still goes through a real login: the server
 * looks the user up and issues a signed session cookie.
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['demo-users'],
    queryFn: () => api<{ users: DemoUser[] }>('/auth/demo-users'),
  });

  const pick = async (key: string) => {
    setBusy(key);
    try {
      const user = await login(key);
      navigate(homePathFor(user));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const users = data?.users ?? [];
  const main = users.filter((u) => MAIN_DEMO.includes(u.key));
  const extra = users.filter((u) => !MAIN_DEMO.includes(u.key));

  const card = (u: DemoUser) => (
    <button key={u.key} className="user-card" disabled={busy !== null} onClick={() => pick(u.key)}>
      <strong>{u.name}</strong>
      <span className="chip chip-blue">{ROLE_LABELS[u.role]}</span>
      <span className="muted small">{u.centre?.name ?? (u.district ? `${u.district.name} district` : 'State-wide')}</span>
    </button>
  );

  return (
    <main className="page narrow">
      <h1>CertiFlow</h1>
      <p className="muted">Pragati Skills Mission certificate issuance (demo). Choose who you want to be.</p>
      {isLoading && <p>Loading demo users...</p>}
      {error && <p className="error">Could not reach the API. Is it running?</p>}
      <div className="user-grid">{main.map(card)}</div>
      {extra.length > 0 && (
        <>
          <h3>Other district (for isolation checks)</h3>
          <div className="user-grid">{extra.map(card)}</div>
        </>
      )}
      <p className="muted small">
        No login needed for <a href="/verify">public verification</a> or the <a href="/phone">mock candidate phone</a>.
      </p>
    </main>
  );
}
