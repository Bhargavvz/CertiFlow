// Ctrl/Cmd+K: jump to a page, a batch (server search, scoped to what you may see),
// a certificate (State office), switch demo user, or change theme.
import { ROLE_LABELS } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { FileStack, Monitor, Moon, ScrollText, Search, Sun, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { homePathFor, useAuth } from '../../auth';
import { useTheme } from '../../design/theme';
import { notifyError } from '../../toast';
import type { BatchSummary, CertificateSearchRow, DemoUser } from '../../types';
import { StatusBadge } from '../StatusBadge';
import { navFor } from './nav';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const SHORTCUT_LABEL = isMac ? '⌘K' : 'Ctrl K';

function Item({ onSelect, icon, children, value }: { onSelect: () => void; icon: ReactNode; children: ReactNode; value: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-body text-fg data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
    >
      {icon}
      {children}
    </Command.Item>
  );
}

const group = 'px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle';

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, login } = useAuth();
  const { setChoice } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 200);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const searching = open && q.length >= 2;
  const batches = useQuery({
    queryKey: ['palette-batches', q],
    queryFn: () => api<{ batches: BatchSummary[] }>(`/batches?q=${encodeURIComponent(q)}`).then((r) => r.batches),
    enabled: searching,
  });
  const certificates = useQuery({
    queryKey: ['palette-certificates', q],
    queryFn: () => api<{ certificates: CertificateSearchRow[] }>(`/certificates?q=${encodeURIComponent(q)}`).then((r) => r.certificates.slice(0, 8)),
    enabled: searching && user?.role === 'STATE',
  });
  const demoUsers = useQuery({ queryKey: ['demo-users'], queryFn: () => api<{ users: DemoUser[] }>('/auth/demo-users'), enabled: open, staleTime: Infinity, retry: false });

  if (!user) return null;
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const lower = query.trim().toLowerCase();
  const pages = [...navFor(user.role), ...(user.role === 'CENTRE' ? [{ to: '/batches/new', label: 'New batch', icon: FileStack }] : []), { to: '/verify', label: 'Public verify page', icon: Search }].filter(
    (p) => !lower || p.label.toLowerCase().includes(lower),
  );
  const people = (demoUsers.data?.users ?? []).filter((u) => u.name !== user.name && (!lower || `${u.name} ${ROLE_LABELS[u.role]}`.toLowerCase().includes(lower)));
  const themes = [
    { value: 'light' as const, label: 'Light theme', icon: Sun },
    { value: 'dark' as const, label: 'Dark theme', icon: Moon },
    { value: 'system' as const, label: 'System theme', icon: Monitor },
  ].filter((t) => !lower || t.label.toLowerCase().includes(lower));

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-40 bg-[#0a111c]/50 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-4 text-subtle" aria-hidden />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={user.role === 'STATE' ? 'Search batches, certificates, pages…' : 'Search batches and pages…'}
          className="h-12 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-subtle"
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.6875rem] text-muted">Esc</kbd>
      </div>
      <Command.List className="relative max-h-[60vh] overflow-y-auto p-1">
        <Command.Empty className="px-4 py-8 text-center text-body text-muted">
          {searching && (batches.isFetching || certificates.isFetching) ? 'Searching…' : 'No results.'}
        </Command.Empty>

        {pages.length > 0 && (
          <Command.Group heading="Go to" className={group}>
            {pages.map((p) => (
              <Item key={p.to} value={`page-${p.to}`} icon={<p.icon />} onSelect={() => (p.to === '/verify' ? window.open('/verify', '_blank') : go(p.to))}>
                {p.label}
              </Item>
            ))}
          </Command.Group>
        )}

        {searching && (batches.data ?? []).length > 0 && (
          <Command.Group heading="Batches" className={group}>
            {batches.data!.map((b) => (
              <Item key={b.id} value={`batch-${b.id}`} icon={<FileStack />} onSelect={() => go(`/batches/${b.id}`)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{b.courseName}</span>
                  <span className="block truncate text-caption text-muted">{b.centre.name}</span>
                </span>
                <StatusBadge kind="batch" status={b.status} size="sm" />
              </Item>
            ))}
          </Command.Group>
        )}

        {searching && (certificates.data ?? []).length > 0 && (
          <Command.Group heading="Certificates" className={group}>
            {certificates.data!.map((c) => (
              <Item key={c.certificateNumber} value={`cert-${c.certificateNumber}`} icon={<ScrollText />} onSelect={() => go(`/certificates?q=${encodeURIComponent(c.certificateNumber)}`)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-caption">{c.certificateNumber}</span>
                  <span className="block truncate text-caption text-muted">
                    {c.candidate.fullName}, {c.batch.courseName}
                  </span>
                </span>
                <StatusBadge kind="certificate" status={c.status} size="sm" />
              </Item>
            ))}
          </Command.Group>
        )}

        {people.length > 0 && (
          <Command.Group heading="Switch demo user" className={group}>
            {people.map((u) => (
              <Item
                key={u.key}
                value={`user-${u.key}`}
                icon={<UserRound />}
                onSelect={async () => {
                  onOpenChange(false);
                  try {
                    const next = await login(u.key);
                    navigate(homePathFor(next));
                  } catch (e) {
                    notifyError(e, 'Couldn’t switch user');
                  }
                }}
              >
                <span className="flex-1">{u.name}</span>
                <span className="text-caption text-muted">{ROLE_LABELS[u.role]}</span>
              </Item>
            ))}
          </Command.Group>
        )}

        {themes.length > 0 && (
          <Command.Group heading="Appearance" className={group}>
            {themes.map((t) => (
              <Item
                key={t.value}
                value={`theme-${t.value}`}
                icon={<t.icon />}
                onSelect={() => {
                  setChoice(t.value);
                  onOpenChange(false);
                }}
              >
                {t.label}
              </Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <p className="border-t border-border px-4 py-2 text-[0.6875rem] text-subtle">
        {q.length < 2 ? 'Type 2 or more characters to search batches.' : 'Results only include what you’re allowed to see.'} Use ↑ ↓ to move and Enter to open.
      </p>
    </Command.Dialog>
  );
}
