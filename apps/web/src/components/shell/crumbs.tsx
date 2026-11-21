// Pages declare their breadcrumb; the top bar renders it. Keeps the page body for
// content and puts "where am I" in one consistent place.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

const Ctx = createContext<{ crumbs: Crumb[]; set: (c: Crumb[]) => void } | null>(null);

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, set] = useState<Crumb[]>([]);
  return <Ctx.Provider value={{ crumbs, set }}>{children}</Ctx.Provider>;
}

export function useCrumbs(): Crumb[] {
  return useContext(Ctx)?.crumbs ?? [];
}

/** Called by PageHeader. Clears the trail when the page unmounts. */
export function usePublishCrumbs(crumbs: Crumb[] | undefined) {
  const ctx = useContext(Ctx);
  const key = JSON.stringify(crumbs ?? []);
  useEffect(() => {
    if (!ctx) return;
    ctx.set(crumbs ?? []);
    return () => ctx.set([]);
    // Re-publish only when the trail's content changes.
  }, [key]);
}
