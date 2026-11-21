import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { REALTIME_CHANNEL, type RealtimeMessage } from '@certiflow/shared';
import { batchStatus } from './design/status';
import { LIVE_KEYS } from './queries';
import { notify } from './toast';
import type { AuthUser, BatchStatus } from './types';

/** Human-readable toast for the events worth interrupting someone for. */
export function describeEvent(msg: RealtimeMessage): string | null {
  const p = msg.payload as Record<string, unknown>;
  const course = typeof p.courseName === 'string' ? `“${p.courseName}”` : 'A batch';
  const to = p.toState as BatchStatus | undefined;
  switch (msg.type) {
    case 'BatchSubmitted':
      return `${course} was ${p.resubmission ? 'resubmitted' : 'submitted'} for review`;
    case 'BatchApproved':
      return to === 'PENDING_DISTRICT'
        ? `${course}: district approval ${String(p.districtApprovals)} of ${String(p.required)}`
        : `${course} approved · now ${(batchStatus[to ?? 'PENDING_STATE']?.label ?? '').toLowerCase()}`;
    case 'BatchApprovalWithdrawn':
      return `${course}: an approval was withdrawn`;
    case 'BatchSentBack':
      return `${course} was sent back to the centre`;
    case 'BatchRejected':
      return `${course} was rejected`;
    case 'BatchFinalApproved':
      return `${course} has final approval. Issuing certificates…`;
    case 'BatchIssuanceCompleted':
      return `${course}: ${String(p.delivered)} delivered${Number(p.dead) > 0 ? `, ${String(p.dead)} failed` : ''}`;
    case 'CertificateRevoked':
      return `Certificate ${String(p.certificateNumber)} was revoked`;
    case 'SlaBreached':
      return `SLA breached: ${course} has waited too long`;
    default:
      return null; // per-certificate / per-delivery events just update the screen
  }
}

/**
 * One websocket per signed-in tab. Every server event invalidates cached queries
 * (debounced: issuance emits hundreds of events), so screens update in place.
 * After a reconnect everything is refetched, because events may have been missed.
 */
export function useRealtime(user: AuthUser | null): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    const socket = io({ path: '/socket.io', transports: ['websocket'], withCredentials: true });
    let everConnected = false;

    socket.on('connect', () => {
      setConnected(true);
      if (everConnected) void qc.invalidateQueries();
      everConnected = true;
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on(REALTIME_CHANNEL, (msg: RealtimeMessage) => {
      // Your own actions already got a success toast from the button you pressed.
      const mine = (msg.payload as Record<string, unknown>).actorId === user.id;
      const text = mine ? null : describeEvent(msg);
      if (text) notify(text, msg.type === 'SlaBreached' || msg.type === 'BatchRejected' ? 'error' : 'info');

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        for (const key of LIVE_KEYS) void qc.invalidateQueries({ queryKey: [key] });
      }, 300);
    });

    return () => {
      socket.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
    // Reconnect only when the signed-in user changes, not on every render of `user`.
  }, [user?.id, qc]);

  return connected;
}
