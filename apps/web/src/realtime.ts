import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { REALTIME_CHANNEL, STATUS_LABELS, type BatchStatus, type RealtimeMessage } from '@certiflow/shared';
import { useToast } from './toast';
import type { AuthUser } from './types';

/** Human-readable toast for the events worth interrupting someone for. */
function describe(msg: RealtimeMessage): string | null {
  const p = msg.payload as Record<string, unknown>;
  const course = typeof p.courseName === 'string' ? `"${p.courseName}"` : 'A batch';
  const to = p.toState as BatchStatus | undefined;
  switch (msg.type) {
    case 'BatchSubmitted':
      return `${course} was ${p.resubmission ? 'resubmitted' : 'submitted'} for review`;
    case 'BatchApproved':
      return to === 'PENDING_DISTRICT'
        ? `${course}: district approval ${String(p.districtApprovals)} of ${String(p.required)}`
        : `${course} approved, now ${STATUS_LABELS[to ?? 'PENDING_STATE'].toLowerCase()}`;
    case 'BatchApprovalWithdrawn':
      return `${course}: an approval was withdrawn`;
    case 'BatchSentBack':
      return `${course} was sent back: ${String(p.reason ?? '')}`;
    case 'BatchRejected':
      return `${course} was rejected`;
    case 'BatchFinalApproved':
      return `${course} has final approval. Issuing certificates...`;
    case 'BatchIssuanceCompleted':
      return `${course}: issuance finished (${String(p.delivered)} delivered, ${String(p.dead)} failed)`;
    case 'CertificateRevoked':
      return `Certificate ${String(p.certificateNumber)} was revoked`;
    case 'SlaBreached':
      return `SLA breached: ${course} has waited too long at ${String(p.status)}`;
    default:
      return null; // per-certificate / per-delivery events update tables silently
  }
}

/**
 * One websocket per signed-in tab. Every server event invalidates the cached
 * queries (debounced, since issuance emits many events), so screens update without
 * a refresh.
 */
export function useRealtime(user: AuthUser | null): boolean {
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    const socket = io({ path: '/socket.io', transports: ['websocket'], withCredentials: true });
    let everConnected = false;
    socket.on('connect', () => {
      setConnected(true);
      // After a drop we may have missed events: refetch everything on screen.
      if (everConnected) void qc.invalidateQueries();
      everConnected = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on(REALTIME_CHANNEL, (msg: RealtimeMessage) => {
      const text = describe(msg);
      if (text) toast(text, msg.type === 'SlaBreached' || msg.type === 'BatchRejected' ? 'error' : 'info');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        for (const key of ['batches', 'batch', 'queue', 'stuck', 'certificates', 'timeline']) {
          void qc.invalidateQueries({ queryKey: [key] });
        }
      }, 300);
    });
    return () => {
      socket.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user?.id, qc, toast]);

  return connected;
}
