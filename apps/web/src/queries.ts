// One place for every server query. Query keys here are the ones the realtime
// listener invalidates (realtime.ts), so screens update live without a refresh.
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type {
  BatchDetail,
  BatchSummary,
  CertificateSearchRow,
  DeliveriesOverview,
  Meta,
  NotificationItem,
  QueueItem,
  StateOverview,
  Stats,
  StuckResponse,
  TimelineItem,
} from './types';

export const LIVE_KEYS = ['batches', 'batch', 'queue', 'stuck', 'certificates', 'timeline', 'stats', 'overview', 'deliveries', 'notifications'] as const;

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: 5 * 60_000 });
}

export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/stats') });
}

export function useBatches() {
  return useQuery({ queryKey: ['batches'], queryFn: () => api<{ batches: BatchSummary[] }>('/batches').then((r) => r.batches) });
}

export function useBatch(id: string) {
  return useQuery({ queryKey: ['batch', id], queryFn: () => api<BatchDetail>(`/batches/${id}`), enabled: !!id });
}

export function useTimeline(id: string) {
  return useQuery({
    queryKey: ['timeline', id],
    queryFn: () => api<{ items: TimelineItem[] }>(`/batches/${id}/timeline`).then((r) => r.items),
    enabled: !!id,
  });
}

export function useWorkQueue() {
  return useQuery({
    queryKey: ['queue'],
    queryFn: () => api<{ items: QueueItem[] }>('/queue').then((r) => r.items),
    // Only to keep the "waiting for" ages fresh; changes themselves arrive via websocket.
    refetchInterval: 60_000,
  });
}

export function useStuck() {
  return useQuery({ queryKey: ['stuck'], queryFn: () => api<StuckResponse>('/state/stuck'), refetchInterval: 60_000 });
}

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => api<StateOverview>('/state/overview') });
}

export function useDeliveries() {
  return useQuery({ queryKey: ['deliveries'], queryFn: () => api<DeliveriesOverview>('/state/deliveries') });
}

export function useCertificateSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['certificates', q],
    queryFn: () => api<{ certificates: CertificateSearchRow[] }>(`/certificates?q=${encodeURIComponent(q)}`).then((r) => r.certificates),
    enabled,
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: NotificationItem[] }>('/notifications').then((r) => r.items),
    enabled,
  });
}
