// Who you are, plus the per-person settings: theme, demo user switch, sign out.
import { ROLE_LABELS } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { homePathFor, useAuth } from '../../auth';
import { useTheme, type ThemeChoice } from '../../design/theme';
import { cn } from '../../lib/cn';
import { notifyError } from '../../toast';
import type { DemoUser } from '../../types';
import { Avatar } from '../Display';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/overlays';

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match system', icon: Monitor },
];

/**
 * `variant="rail"`: full-width trigger at the bottom of the ink sidebar (avatar only when
 * the rail is collapsed). `variant="bar"`: avatar button for the mobile top bar.
 */
export function AccountMenu({ variant }: { variant: 'rail' | 'bar' }) {
  const { user, login, logout } = useAuth();
  const { choice, setChoice } = useTheme();
  const navigate = useNavigate();
  const demo = useQuery({ queryKey: ['demo-users'], queryFn: () => api<{ users: DemoUser[] }>('/auth/demo-users'), staleTime: Infinity, retry: false });
  if (!user) return null;
  const others = (demo.data?.users ?? []).filter((u) => u.name !== user.name);

  const switchTo = async (key: string) => {
    try {
      const u = await login(key);
      navigate(homePathFor(u));
    } catch (e) {
      notifyError(e, 'Couldn’t switch user');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'rail' ? (
          <button
            type="button"
            aria-label={`Account menu for ${user.name}, ${ROLE_LABELS[user.role]}`}
            className="flex w-full items-center justify-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-ink-2 lg:justify-start"
          >
            <Avatar name={user.name} role={user.role} />
            <span className="hidden min-w-0 flex-1 leading-tight lg:block">
              <span className="block truncate text-body font-semibold text-ink-fg">{user.name}</span>
              <span className="block truncate text-micro text-ink-muted">{ROLE_LABELS[user.role]}</span>
            </span>
            <ChevronsUpDown className="hidden size-4 shrink-0 text-ink-muted lg:block" aria-hidden />
          </button>
        ) : (
          <button type="button" aria-label={`Account menu for ${user.name}`} className="rounded-full p-0.5 hover:ring-2 hover:ring-border">
            <Avatar name={user.name} role={user.role} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={variant === 'rail' ? 'top' : 'bottom'} align={variant === 'rail' ? 'start' : 'end'} className="w-72">
        <div className="flex items-center gap-3 px-2 py-2.5">
          <Avatar name={user.name} role={user.role} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{user.name}</p>
            <p className="text-caption text-muted">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setChoice(t.value)}
              aria-pressed={choice === t.value}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-micro font-medium transition-colors',
                choice === t.value ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border text-muted hover:text-fg',
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Switch demo user</DropdownMenuLabel>
            <div className="relative max-h-64 overflow-y-auto">
              {others.map((u) => (
                <DropdownMenuItem key={u.key} onSelect={() => void switchTo(u.key)}>
                  <Avatar name={u.name} role={u.role} size="sm" />
                  <span className="flex-1 truncate">{u.name}</span>
                  <span className="text-micro text-muted">{ROLE_LABELS[u.role]}</span>
                </DropdownMenuItem>
              ))}
            </div>
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
