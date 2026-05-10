'use client';

/**
 * Renders a job's agent_events timeline as a vertical, type-aware list.
 *
 * Driven by useJobEvents(jobId) — pass null jobId to render an empty
 * placeholder. Supports both live (streaming) and terminal-state runs.
 */

import { useState } from 'react';
import { Card, CardBody } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Button } from '@heroui/button';
import { Loader2 } from 'lucide-react';
import { useJobEvents, type JobEventRow } from '@/hooks/queries/useJobEvents';

export interface JobEventTimelineProps {
  jobId: string | null;
}

export function JobEventTimeline({ jobId }: JobEventTimelineProps): JSX.Element {
  const { events, isStreaming, finalStatus, error } = useJobEvents(jobId);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function requestCancel(): Promise<void> {
    if (!jobId || cancelPending) return;
    setCancelPending(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/ralph/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setCancelError(body?.error ?? `Cancel failed (HTTP ${res.status})`);
      }
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelPending(false);
    }
  }

  if (!jobId) {
    return (
      <Card className="bg-default-50">
        <CardBody>
          <p className="text-default-500 text-sm">No active job for this task.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        {isStreaming ? (
          <>
            <Loader2 className="text-default-600 h-3.5 w-3.5 animate-spin" />
            <span className="text-default-600">Streaming live events…</span>
            <Button
              size="sm"
              color="warning"
              variant="flat"
              isLoading={cancelPending}
              onPress={() => void requestCancel()}
              className="ml-auto"
            >
              Cancel
            </Button>
          </>
        ) : finalStatus ? (
          <Chip
            size="sm"
            color={
              finalStatus === 'completed'
                ? 'success'
                : finalStatus === 'cancelled'
                  ? 'warning'
                  : 'danger'
            }
          >
            {finalStatus}
          </Chip>
        ) : null}
        {error && <span className="text-danger text-xs">{error}</span>}
        {cancelError && <span className="text-danger text-xs">{cancelError}</span>}
      </div>

      {events.length === 0 && !isStreaming ? (
        <Card className="bg-default-50">
          <CardBody>
            <p className="text-default-500 text-sm">No events recorded for this run.</p>
          </CardBody>
        </Card>
      ) : (
        <ol className="space-y-1">
          {events.map((event) => (
            <li key={event.id}>
              <EventRow event={event} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EventRow({ event }: { event: JobEventRow }): JSX.Element {
  const time = new Date(event.createdAt).toLocaleTimeString();
  const summary = renderSummary(event);
  const color = colorForType(event.type);

  return (
    <div className="border-default-200 hover:bg-default-50 flex items-start gap-2 rounded border px-2 py-1 text-xs">
      <span className="text-default-400 w-20 font-mono">{time}</span>
      <Chip size="sm" color={color} variant="flat" className="min-w-fit">
        {event.type}
      </Chip>
      <span className="text-default-700 flex-1 break-words">{summary}</span>
    </div>
  );
}

function renderSummary(event: JobEventRow): string {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case 'assistant_message':
      return truncate(asString(p.text), 200);
    case 'thinking':
      return `(thinking) ${truncate(asString(p.text), 160)}`;
    case 'tool_call': {
      const name = asString(p.name);
      const inputPreview = truncate(JSON.stringify(p.input ?? {}), 120);
      return `${name}(${inputPreview})`;
    }
    case 'tool_result': {
      const isError = p.isError === true;
      return `${isError ? 'error: ' : ''}${truncate(asString(p.content), 200)}`;
    }
    case 'usage_update':
      return `in=${p.inputTokens} out=${p.outputTokens} model=${asString(p.model)}`;
    case 'done':
      return p.stopReason ? `stop_reason=${asString(p.stopReason)}` : 'done';
    case 'error':
      return asString(p.message);
    default:
      return JSON.stringify(p).slice(0, 200);
  }
}

function colorForType(type: string): 'default' | 'primary' | 'secondary' | 'warning' | 'danger' {
  switch (type) {
    case 'assistant_message':
      return 'primary';
    case 'tool_call':
      return 'secondary';
    case 'tool_result':
      return 'default';
    case 'thinking':
      return 'default';
    case 'usage_update':
      return 'default';
    case 'done':
      return 'primary';
    case 'error':
      return 'danger';
    default:
      return 'default';
  }
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.substring(0, max) + '…';
}
