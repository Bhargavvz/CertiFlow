import type { Role } from '@certiflow/shared';
import {
  ClipboardCheck,
  FileStack,
  LayoutDashboard,
  ListChecks,
  PieChart,
  ScrollText,
  Send,
  Siren,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact match for the active state. */
  end?: boolean;
}

/** Role-specific navigation: only pages the role can use. The server enforces access regardless. */
export function navFor(role: Role): NavItem[] {
  switch (role) {
    case 'CENTRE':
      return [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/batches', label: 'My batches', icon: FileStack },
      ];
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
        { to: '/overview', label: 'Overview', icon: PieChart },
        { to: '/queue', label: 'Final approval', icon: ListChecks },
        { to: '/stuck', label: 'Stuck (SLA)', icon: Siren },
        { to: '/certificates', label: 'Certificates', icon: ScrollText },
        { to: '/deliveries', label: 'Deliveries', icon: Send },
        { to: '/batches', label: 'All batches', icon: FileStack },
      ];
  }
}

export const ROLE_BLURB: Record<Role, string> = {
  CENTRE: 'Create batches, upload candidates, submit, and fix anything sent back.',
  DISTRICT_OFFICER: 'Review your district’s batches. Two different officers must approve each one.',
  QUALITY: 'Extra check on large batches before they reach the State office.',
  STATE: 'Final approval, stuck batches, revocations and WhatsApp deliveries.',
};

/** Breadcrumb root for each role's home. */
export function homeCrumb(role: Role): { label: string; to: string } {
  return role === 'CENTRE'
    ? { label: 'Dashboard', to: '/dashboard' }
    : role === 'STATE'
      ? { label: 'Overview', to: '/overview' }
      : { label: 'Queue', to: '/queue' };
}
