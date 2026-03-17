/** Run management and SSE streaming service layer. */

import type { GraphEvent } from "@shared/events";
import { apiUrl, request } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamHandlers {
  onEvent: (event: GraphEvent, eventId: number | null) => void;
  onError: (error: Error) => void;
}

export interface RunStatusResponse {
  run_id: string;
  graph_id: string;
  status: "running" | "paused" | "completed" | "error";
  node_id: string | null;
  prompt: string | null;
  final_state: unknown | null;
  duration_ms: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

/** Start a run — POST /graphs/{graph_id}/run */
export async function startRun(
  graphId: string,
  input?: Record<string, unknown>,
): Promise<{ run_id: string; status: string }> {
  return request<{ run_id: string; status: string }>(
    `/graphs/${encodeURIComponent(graphId)}/run`,
    {
      method: "POST",
      body: JSON.stringify({ input: input ?? {} }),
    },
  );
}

/** Resume a paused run — POST /runs/{run_id}/resume */
export async function resumeRun(
  runId: string,
  input: unknown,
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/runs/${encodeURIComponent(runId)}/resume`,
    {
      method: "POST",
      body: JSON.stringify({ input }),
    },
  );
}

/** Cancel a running/paused run — POST /runs/{run_id}/cancel */
export async function cancelRun(runId: string): Promise<void> {
  await request(`/runs/${encodeURIComponent(runId)}/cancel`, {
    method: "POST",
  });
}

/** Get current run status — GET /runs/{run_id}/status */
export async function getRunStatus(runId: string): Promise<RunStatusResponse> {
  return request<RunStatusResponse>(
    `/runs/${encodeURIComponent(runId)}/status`,
  );
}

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  "run_started",
  "node_started",
  "node_completed",
  "edge_traversed",
  "graph_paused",
  "graph_completed",
  "error",
] as const;

/**
 * Connect to an SSE run stream.
 *
 * Uses named event listeners (not onmessage) because the server sends typed
 * SSE events. Returns a cleanup function that closes the EventSource.
 *
 * No auto-reconnect — EventSource is closed on error so the store's
 * reconnection state machine (runSlice) can control backoff and status checks.
 */
export function connectStream(
  runId: string,
  handlers: StreamHandlers,
  lastEventId?: number,
): () => void {
  const encoded = encodeURIComponent(runId);
  const params =
    lastEventId != null && lastEventId > 0
      ? `?last_event_id=${lastEventId}`
      : "";
  const url = apiUrl(`/runs/${encoded}/stream${params}`);

  const source = new EventSource(url);

  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (e: MessageEvent) => {
      const eventId = e.lastEventId ? Number(e.lastEventId) : null;
      try {
        const data = JSON.parse(e.data);
        handlers.onEvent({ event: type, data } as GraphEvent, eventId);
      } catch {
        // Malformed SSE data — skip event, don't crash the stream
      }
    });
  }

  source.onerror = () => {
    source.close();
    handlers.onError(new Error("SSE connection lost"));
  };

  return () => {
    source.close();
  };
}
