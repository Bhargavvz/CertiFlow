import type { Role } from '@certiflow/shared';
import { ClipboardCheck, FileStack, LayoutDashboard, ListChecks, ScrollText, Siren, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact match for the active state (e.g. "/" must not match everything). */
  end?: boolean;
}

/** Role-specific navigation. Only pages the role can actually use; the server enforces access regardless. */
export function navFor(role: Role): NavItem[] {
  switch (role) {
    case 'CENTRE':
      return [{ to: '/batches', label: 'My batches', icon: FileStack }];
    case 'DISTRICT_OFFICER':
      return [
        { to: '/queue', label: 'Waiting for me', icon: ListChecks },
        { to: '/batches', label: 'District batches', icon: FileStack },
      ];
    case 'QUALITY':
      return [
        { to: '/queue', label: 'Quality queue', icon: ClipboardCheck },
        { to: '/batches', label: 'All batches', icon: FileStack },
      ];
    case 'STATE':
      return [
        { to: '/queue', label: 'Final approval', icon: ListChecks },
        { to: '/stuck', label: 'Stuck (SLA)', icon: Siren },
        { to: '/certificates', label: 'Certificates', icon: ScrollText },
        { to: '/batches', label: 'All batches', icon: LayoutDashboard },
      ];
  }
}

export const ROLE_BLURB: Record<Role, string> = {
  CENTRE: 'Create batches, upload candidates, submit and fix sent-back batches.',
  DISTRICT_OFFICER: 'Review your district’s batches. Two officers must approve each one.',
  QUALITY: 'Extra check for large batches (50 or more candidates).',
  STATE: 'Final approval, stuck batches, revocations and deliveries.',
};
