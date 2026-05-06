'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shape of an event row received from /api/ralph/jobs/:jobId/events. The
 * `payload` field carries the full AgentEvent JSON for the variant.
 */
export interface JobEventRow {
  id: string;
  runId: string;
  seq: number;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface UseJobEventsResult {
  events: JobEventRow[];
  /** True until the SSE stream emits its terminal `done` message. */
  isStreaming: boolean;
  /** Final run status reported by the server when the stream closes. */
  finalStatus: 'completed' | 'failed' | 'cancelled' | null;
  /** Last error message from the stream (network or server-emitted). */
  error: string | null;
}

/**
 * Subscribe to a job's agent_events SSE stream. Auto-cleans the EventSource
 * on unmount or when the runtime indicates the stream is done.
 *
 * Pass `null` for jobId to disable the subscription (e.g. before a job has
 * been created).
 */
export function useJobEvents(jobId: string | null): UseJobEventsResult {
  const [events, setEvents] = useState<JobEventRow[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(jobId !== null);
  const [finalStatus, setFinalStatus] = useState<UseJobEventsResult['finalStatus']>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref so the hook can resume from the last seen seq if the
  // EventSource auto-reconnects after a transient network blip.
  const lastSeqRef = useRef<number>(-1);

  useEffect(() => {
    if (!jobId) {
      setEvents([]);
      setIsStreaming(false);
      setFinalStatus(null);
      setError(null);
      return;
    }

    setEvents([]);
    setIsStreaming(true);
    setFinalStatus(null);
    setError(null);
    lastSeqRef.current = -1;

    const url =
      lastSeqRef.current >= 0
        ? `/api/ralph/jobs/${encodeURIComponent(jobId)}/events?fromSeq=${lastSeqRef.current}`
        : `/api/ralph/jobs/${encodeURIComponent(jobId)}/events`;

    const source = new EventSource(url);

    source.addEventListener('agent_event', (e: MessageEvent) => {
      try {
        const row = JSON.parse(e.data) as JobEventRow;
        lastSeqRef.current = row.seq;
        setEvents((prev) => [...prev, row]);
      } catch {
        // Bad payload — surface as an error.
        setError('Received malformed agent_event payload');
      }
    });

    source.addEventListener('done', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { status: UseJobEventsResult['finalStatus'] };
        setFinalStatus(data.status);
      } catch {
        // ignore
      }
      setIsStreaming(false);
      source.close();
    });

    source.addEventListener('error', (e: MessageEvent | Event) => {
      const message =
        typeof (e as MessageEvent).data === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse((e as MessageEvent).data) as { message?: string };
                return parsed.message ?? 'Stream error';
              } catch {
                return 'Stream error';
              }
            })()
          : 'Stream connection error';
      setError(message);
      // EventSource auto-reconnects on transport errors; only stop here when
      // the server has closed the stream (readyState=2 CLOSED).
      if (source.readyState === EventSource.CLOSED) {
        setIsStreaming(false);
      }
    });

    return () => {
      source.close();
    };
  }, [jobId]);

  return { events, isStreaming, finalStatus, error };
}
