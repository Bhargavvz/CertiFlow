// The signed-in frame: sidebar (full on desktop, icon rail on tablet, drawer on
// mobile), top bar, and the routed page. Every page renders its own PageHeader.
import { ROLE_LABELS } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check, ExternalLink, LogOut, Menu, Monitor, Moon, Smartphone, Sun, Users, Workflow } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { homePathFor, useAuth } from '../../auth';
import { useTheme, type ThemeChoice } from '../../design/theme';
import { cn } from '../../lib/cn';
import { useRealtime } from '../../realtime';
import { notifyError } from '../../toast';
import type { DemoUser } from '../../types';
import { Avatar, LiveIndicator } from '../Display';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '../ui/overlays';
import { navFor, type NavItem } from './nav';

function Brand({ compact, tight }: { compact?: boolean; tight?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-fg shadow-sm">
        <BadgeCheck className="size-[18px]" aria-hidden />
      </span>
      <span className={cn('leading-tight', compact && 'lg:block hidden')}>
        <span className="block text-[0.9375rem] font-semibold tracking-tight text-fg">CertiFlow</span>
        <span className={cn('block whitespace-nowrap text-[0.6875rem] text-muted', tight && 'hidden sm:block')}>Pragati Skills Mission</span>
      </span>
    </span>
  );
}

function NavLinks({ items, rail, onNavigate }: { items: NavItem[]; rail?: boolean; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const link = (
          <NavLink
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            aria-label={item.label}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-md px-2.5 py-2 text-body font-medium transition-colors',
                rail && 'justify-center lg:justify-start',
                isActive ? 'bg-primary-soft text-primary-soft-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <item.icon className="size-[18px] shrink-0" aria-hidden />
            <span className={cn(rail && 'sr-only lg:not-sr-only')}>{item.label}</span>
          </NavLink>
        );
        return (
          <li key={item.to}>
            {rail ? (
              <span className="lg:hidden">
                <Tooltip content={item.label} side="right">
                  {link}
                </Tooltip>
              </span>
            ) : null}
            <span className={cn(rail && 'hidden lg:block')}>{link}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ExternalLinks({ isState, rail }: { isState: boolean; rail?: boolean }) {
  const links = [
    { href: '/verify', label: 'Public verify', icon: BadgeCheck },
    { href: '/phone', label: 'Mock phone', icon: Smartphone },
    ...(isState ? [{ href: '/admin/queues', label: 'Job queues', icon: Workflow }] : []),
  ];
  return (
    <div className="mt-6">
      <p className={cn('mb-1.5 px-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-subtle', rail && 'hidden lg:block')}>
        Tools
      </p>
      <ul className="flex flex-col gap-0.5">
        {links.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target="_blank"
              rel="noreferrer"
              title={l.label}
              className={cn(
                'flex items-center gap-3 rounded-md px-2.5 py-2 text-body text-muted transition-colors hover:bg-surface-2 hover:text-fg',
                rail && 'justify-center lg:justify-start',
              )}
            >
              <l.icon className="size-[18px] shrink-0" aria-hidden />
              <span className={cn('flex-1', rail && 'sr-only lg:not-sr-only')}>{l.label}</span>
              <ExternalLink className={cn('size-3.5 text-subtle', rail && 'hidden lg:block')} aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ThemeMenu() {
  const { choice, resolved, setChoice } = useTheme();
  const Icon = resolved === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${choice}`}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        {THEMES.map((t) => (
          <DropdownMenuItem key={t.value} onSelect={() => setChoice(t.value)}>
            <t.icon aria-hidden />
            <span className="flex-1">{t.label}</span>
            {choice === t.value && <Check className="!text-primary" aria-label="selected" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  // Demo only: the endpoint 404s when DEMO_LOGIN_ENABLED=false, and then the switcher hides.
  const demo = useQuery({
    queryKey: ['demo-users'],
    queryFn: () => api<{ users: DemoUser[] }>('/auth/demo-users'),
    staleTime: Infinity,
    retry: false,
  });
  if (!user) return null;
  const others = (demo.data?.users ?? []).filter((u) => u.name !== user.name);

  const switchTo = async (key: string) => {
    try {
      const u = await login(key);
      navigate(homePathFor(u));
    } catch (e) {
      notifyError(e, 'Could not switch user');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu: ${user.name}, ${ROLE_LABELS[user.role]}`}
          className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-surface-2"
        >
          <Avatar name={user.name} role={user.role} />
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-body font-medium text-fg">{user.name}</span>
            <span className="block text-[0.6875rem] text-muted">{ROLE_LABELS[user.role]}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={user.name} role={user.role} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{user.name}</p>
            <p className="text-caption text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden /> Switch demo user
              </span>
            </DropdownMenuLabel>
            {others.map((u) => (
              <DropdownMenuItem key={u.key} onSelect={() => void switchTo(u.key)}>
                <Avatar name={u.name} role={u.role} size="sm" />
                <span className="flex-1 truncate">{u.name}</span>
                <span className="text-[0.6875rem] text-muted">{ROLE_LABELS[u.role]}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const connected = useRealtime(user);
  const [drawer, setDrawer] = useState(false);
  if (!user) return null;
  const items = navFor(user.role);

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      {/* Sidebar: icon rail on tablet (md), full width on desktop (lg), hidden on mobile. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-border bg-surface px-2 py-4 md:flex lg:w-60 lg:px-3">
        <div className="mb-6 flex justify-center px-1 lg:justify-start lg:px-1.5">
          <Brand compact />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <NavLinks items={items} rail />
          <ExternalLinks isState={user.role === 'STATE'} rail />
        </nav>
        <p className="hidden px-2.5 text-[0.6875rem] text-subtle lg:block">Demo environment · fictional data</p>
      </aside>

      {/* Mobile drawer */}
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <DialogContent title="Navigation" side="left">
          <div className="flex h-full flex-col px-3 py-4">
            <div className="mb-6 px-1.5">
              <Brand />
            </div>
            <nav aria-label="Main" className="flex-1 overflow-y-auto">
              <NavLinks items={items} onNavigate={() => setDrawer(false)} />
              <ExternalLinks isState={user.role === 'STATE'} />
            </nav>
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-w-0 md:pl-16 lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/75 sm:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <span className="md:hidden">
            <Brand tight />
          </span>
          <div className="flex-1" />
          <LiveIndicator connected={connected} />
          <ThemeMenu />
          <UserMenu />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
