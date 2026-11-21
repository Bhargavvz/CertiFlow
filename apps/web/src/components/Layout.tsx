import { ROLE_LABELS } from '@certiflow/shared';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useRealtime } from '../realtime';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const connected = useRealtime(user);
  if (!user) return null;

  const links: { to: string; label: string }[] =
    user.role === 'CENTRE'
      ? [{ to: '/batches', label: 'My batches' }]
      : user.role === 'STATE'
        ? [
            { to: '/queue', label: 'Final approval' },
            { to: '/stuck', label: 'Stuck (SLA)' },
            { to: '/certificates', label: 'Certificates' },
            { to: '/batches', label: 'All batches' },
          ]
        : [
            { to: '/queue', label: 'Waiting for me' },
            { to: '/batches', label: 'All batches' },
          ];

  return (
    <>
      <header className="topbar">
        <span className="brand">CertiFlow</span>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
          <a href="/verify" target="_blank" rel="noreferrer">
            Public verify
          </a>
          <a href="/phone" target="_blank" rel="noreferrer">
            Mock phone
          </a>
          {user.role === 'STATE' && (
            <a href="/admin/queues" target="_blank" rel="noreferrer">
              Queues
            </a>
          )}
        </nav>
        <span className="who">
          <span className={connected ? 'dot dot-on' : 'dot'} title={connected ? 'Live updates on' : 'Live updates offline'} />
          {user.name} <span className="chip chip-blue">{ROLE_LABELS[user.role]}</span>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Switch user
          </button>
        </span>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
