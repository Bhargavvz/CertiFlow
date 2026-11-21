// The signed-in frame. A deep-ink navigation rail (full on desktop, icons on tablet,
// a drawer on phones) and a light work area whose top bar carries the breadcrumb,
// search, live status and notifications.
import { ArrowUpRight, Menu, Search, ShieldCheck, Smartphone, Workflow } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Brand, BrandMark } from '../../design/Brand';
import { GuillocheBand } from '../../design/Guilloche';
import { cn } from '../../lib/cn';
import { useRealtime } from '../../realtime';
import { Breadcrumb, LiveIndicator } from '../Display';
import { Button } from '../ui/button';
import { Dialog, DialogContent, Tooltip } from '../ui/overlays';
import { AccountMenu } from './AccountMenu';
import { CommandPalette, SHORTCUT_LABEL } from './CommandPalette';
import { CrumbsProvider, useCrumbs } from './crumbs';
import { navFor, type NavItem } from './nav';
import { NotificationBell } from './Notifications';

function RailLink({ item, rail, onNavigate }: { item: NavItem; rail: boolean; onNavigate?: () => void }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium transition-colors',
          rail && 'justify-center lg:justify-start',
          isActive ? 'bg-ink-2 text-ink-fg' : 'text-ink-muted hover:bg-ink-2/60 hover:text-ink-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active marker: a short ink rule at the left edge. */}
          <span aria-hidden className={cn('absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ink-fg transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
          <item.icon className="size-[18px] shrink-0" aria-hidden />
          <span className={cn(rail && 'sr-only lg:not-sr-only')}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
  if (!rail) return link;
  return (
    <>
      <span className="lg:hidden">
        <Tooltip content={item.label} side="right">
          {link}
        </Tooltip>
      </span>
      <span className="hidden lg:block">{link}</span>
    </>
  );
}

function Sidebar({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  const tools = [
    { href: '/verify', label: 'Public verify', icon: ShieldCheck },
    { href: '/phone', label: 'Candidate phone (demo)', icon: Smartphone },
    ...(user.role === 'STATE' ? [{ href: '/admin/queues', label: 'Job queues', icon: Workflow }] : []),
  ];

  return (
    <div className="flex h-full flex-col bg-ink text-ink-fg">
      {/* Crest */}
      <div className="relative overflow-hidden px-3 pb-5 pt-5">
        <GuillocheBand className="pointer-events-none absolute inset-x-0 bottom-0 h-10 w-full text-ink-fg/[0.08]" />
        <div className={cn('relative px-1', rail && 'flex justify-center lg:block')}>
          {rail ? (
            <>
              <span className="text-ink-fg lg:hidden">
                <BrandMark />
              </span>
              <Brand tone="ink" className="hidden lg:flex" />
            </>
          ) : (
            <Brand tone="ink" />
          )}
        </div>
      </div>

      <nav aria-label="Main" className="relative flex-1 overflow-y-auto px-3 pt-2">
        <p className={cn('mb-1.5 px-3 text-micro font-medium text-ink-muted', rail && 'hidden lg:block')}>Workspace</p>
        <ul className="flex flex-col gap-0.5">
          {navFor(user.role).map((item) => (
            <li key={item.to}>
              <RailLink item={item} rail={rail} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <p className={cn('mb-1.5 mt-7 px-3 text-micro font-medium text-ink-muted', rail && 'hidden lg:block')}>Open in a new tab</p>
        {rail && <hr className="mx-2 my-4 border-ink-border lg:hidden" />}
        <ul className="flex flex-col gap-0.5">
          {tools.map((t) => (
            <li key={t.href}>
              <a
                href={t.href}
                target="_blank"
                rel="noreferrer"
                title={t.label}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2 text-body text-ink-muted transition-colors hover:bg-ink-2/60 hover:text-ink-fg',
                  rail && 'justify-center lg:justify-start',
                )}
              >
                <t.icon className="size-[18px] shrink-0" aria-hidden />
                <span className={cn('flex-1', rail && 'sr-only lg:not-sr-only')}>{t.label}</span>
                <ArrowUpRight className={cn('size-3.5 opacity-0 transition-opacity group-hover:opacity-100', rail && 'hidden lg:block')} aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-ink-border p-3">
        <AccountMenu variant="rail" />
        <p className={cn('mt-2 px-2 text-micro text-ink-muted/80', rail && 'hidden lg:block')}>Demo environment with fictional data</p>
      </div>
    </div>
  );
}

function TopBar({ connected, onMenu, onSearch }: { connected: boolean; onMenu: () => void; onSearch: () => void }) {
  const { user } = useAuth();
  const crumbs = useCrumbs();
  if (!user) return null;
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 px-3 sm:px-6 lg:px-10">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} aria-label="Open navigation">
          <Menu />
        </Button>
        <Breadcrumb items={crumbs} className="min-w-0 flex-1" />
        {crumbs.length === 0 && <span className="flex-1" />}
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-64 items-center gap-2 rounded-md border border-border bg-surface px-3 text-body text-subtle transition-colors hover:border-border-strong hover:text-muted lg:flex"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">{user.role === 'STATE' ? 'Batches, certificates…' : 'Search batches…'}</span>
          <kbd className="rounded border border-border px-1.5 font-sans text-micro text-muted">{SHORTCUT_LABEL}</kbd>
        </button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onSearch} aria-label="Search">
          <Search />
        </Button>
        <LiveIndicator connected={connected} />
        <NotificationBell />
        <span className="md:hidden">
          <AccountMenu variant="bar" />
        </span>
      </div>
    </header>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const connected = useRealtime(user);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  if (!user) return null;

  return (
    <CrumbsProvider>
      <div className="min-h-dvh bg-bg">
        <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
          Skip to content
        </a>

        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] md:block lg:w-[252px]">
          <Sidebar rail />
        </aside>

        <Dialog open={drawer} onOpenChange={setDrawer}>
          <DialogContent title="Navigation" side="left" className="border-ink-border bg-ink">
            <Sidebar rail={false} onNavigate={() => setDrawer(false)} />
          </DialogContent>
        </Dialog>

        <div className="min-w-0 md:pl-[72px] lg:pl-[252px]">
          <TopBar connected={connected} onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} />
          <CommandPalette open={palette} onOpenChange={setPalette} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1320px] px-4 pb-16 pt-7 focus:outline-none sm:px-6 lg:px-10 lg:pt-9">
            <Outlet />
          </main>
        </div>
      </div>
    </CrumbsProvider>
  );
}
