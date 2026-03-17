import { ApiError } from "@api/client";
import {
  cancelRun as cancelRunApi,
  connectStream,
  getRunStatus,
  resumeRun as resumeRunApi,
  startRun as startRunApi,
} from "@api/runs";
import type { GraphEvent } from "@shared/events";
import { useUIStore } from "@store/uiSlice";
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RunStatus =
  | "idle"
  | "running"
  | "paused"
  | "reconnecting"
  | "completed"
  | "error"
  | "connection_lost";

export interface RunSlice {
  activeRunId: string | null;
  runStatus: RunStatus;
  activeNodeId: string | null;
  runOutput: GraphEvent[];
  reconnectAttempts: number;
  lastEventId: number;
  finalState: unknown | null;
  durationMs: number | null;
  errorMessage: string | null;
  pausedPrompt: string | null;

  startRun: (graphId: string, input?: Record<string, unknown>) => Promise<void>;
  cancelRun: () => Promise<void>;
  resumeRun: (input: unknown) => Promise<void>;
  resetRun: () => void;

  /** @internal — called by SSE event handlers */
  _handleEvent: (event: GraphEvent, eventId: number | null) => void;
  /** @internal — called on SSE connection error */
  _handleStreamError: (error: Error) => void | Promise<void>;
  /** @internal — close the current SSE connection */
  _disconnect: () => void;
}

// ---------------------------------------------------------------------------
// Private state (module closure — not serializable, not needed by components)
// ---------------------------------------------------------------------------

let cleanup: (() => void) | null = null;
let terminalReceived = false;
let reconnecting = false;

const MAX_RECONNECT_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const INITIAL_STATE = {
  activeRunId: null,
  runStatus: "idle" as RunStatus,
  activeNodeId: null,
  runOutput: [] as GraphEvent[],
  reconnectAttempts: 0,
  lastEventId: 0,
  finalState: null,
  durationMs: null,
  errorMessage: null,
  pausedPrompt: null,
};

function showToast(
  message: string,
  variant: "error" | "success" | "info" = "error",
) {
  useUIStore.getState().showToast(message, variant);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useRunStore = create<RunSlice>((set) => ({
  ...INITIAL_STATE,

  startRun: async (graphId, input) => {
    cleanup?.();
    cleanup = null;
    terminalReceived = false;
    reconnecting = false;
    set({
      ...INITIAL_STATE,
      runStatus: "running",
    });

    try {
      const { run_id } = await startRunApi(graphId, input);
      set({ activeRunId: run_id });

      const { _handleEvent, _handleStreamError } = useRunStore.getState();
      cleanup = connectStream(run_id, {
        onEvent: _handleEvent,
        onError: _handleStreamError,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to start run";
      set({ runStatus: "error", errorMessage: message });
      showToast(message);
    }
  },

  cancelRun: async () => {
    const { activeRunId } = useRunStore.getState();
    if (!activeRunId) return;

    cleanup?.();
    cleanup = null;

    try {
      await cancelRunApi(activeRunId);
    } catch {
      // Best-effort — run may have already completed
    }
    set({ runStatus: "idle", activeNodeId: null });
  },

  resumeRun: async (input) => {
    const { activeRunId, _handleEvent, _handleStreamError } =
      useRunStore.getState();
    if (!activeRunId) return;

    // Close old connection, open new one BEFORE the resume POST
    // (race condition fix — server waits 2s for SSE listener)
    cleanup?.();
    terminalReceived = false;
    cleanup = connectStream(activeRunId, {
      onEvent: _handleEvent,
      onError: _handleStreamError,
    });

    set({ runStatus: "running", pausedPrompt: null });

    try {
      await resumeRunApi(activeRunId, input);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to resume run";
      set({ runStatus: "error", errorMessage: message });
      showToast(message);
    }
  },

  resetRun: () => {
    cleanup?.();
    cleanup = null;
    terminalReceived = false;
    reconnecting = false;
    set(INITIAL_STATE);
  },

  _handleEvent: (event, eventId) => {
    // Close connection on terminal events BEFORE updating state.
    // Set terminalReceived to prevent onerror → reconnection race.
    if (
      event.event === "graph_completed" ||
      (event.event === "error" && !event.data.recoverable)
    ) {
      terminalReceived = true;
      cleanup?.();
      cleanup = null;
    }

    set((s) => {
      const output = [...s.runOutput, event];
      const base = { runOutput: output, lastEventId: eventId ?? s.lastEventId };

      switch (event.event) {
        case "run_started":
          return { ...base, runStatus: "running" as const };

        case "node_started":
          return { ...base, activeNodeId: event.data.node_id };

        case "node_completed":
          return base;

        case "edge_traversed":
          return base;

        case "graph_paused":
          return {
            ...base,
            runStatus: "paused" as const,
            activeNodeId: event.data.node_id,
            pausedPrompt: event.data.prompt,
          };

        case "graph_completed":
          return {
            ...base,
            runStatus: "completed" as const,
            activeNodeId: null,
            finalState: event.data.final_state,
            durationMs: event.data.duration_ms,
          };

        case "error":
          if (!event.data.recoverable) {
            return {
              ...base,
              runStatus: "error" as const,
              activeNodeId: event.data.node_id ?? s.activeNodeId,
              errorMessage: event.data.message,
            };
          }
          return base;

        default:
          return base;
      }
    });
  },

  _handleStreamError: (_error) => {
    if (terminalReceived) return;
    if (reconnecting) return;

    cleanup = null;
    const state = useRunStore.getState();
    if (state.runStatus !== "running" && state.runStatus !== "reconnecting") {
      return;
    }
    if (!state.activeRunId) return;

    const runId = state.activeRunId;
    reconnecting = true;

    // Iterative reconnection loop with exponential backoff
    (async () => {
      for (
        let attempt = state.reconnectAttempts + 1;
        attempt <= MAX_RECONNECT_ATTEMPTS;
        attempt++
      ) {
        // Bail if the run was cancelled/reset while we were waiting
        if (terminalReceived || !reconnecting) return;

        set({ runStatus: "reconnecting", reconnectAttempts: attempt });

        // Exponential backoff: 1s, 2s, 4s
        await sleep(1000 * 2 ** (attempt - 1));

        // Re-check after sleep — run may have been cancelled/reset
        if (terminalReceived || !reconnecting) return;

        try {
          const status = await getRunStatus(runId);

          // Run was cancelled/reset during the fetch
          if (terminalReceived || !reconnecting) return;

          switch (status.status) {
            case "completed":
              reconnecting = false;
              set({
                runStatus: "completed",
                finalState: status.final_state,
                durationMs: status.duration_ms,
                activeNodeId: null,
              });
              return;

            case "running": {
              reconnecting = false;
              const { _handleEvent, _handleStreamError, lastEventId } =
                useRunStore.getState();
              cleanup = connectStream(
                runId,
                { onEvent: _handleEvent, onError: _handleStreamError },
                lastEventId,
              );
              set({ runStatus: "running", reconnectAttempts: 0 });
              return;
            }

            case "paused":
              reconnecting = false;
              set({
                runStatus: "paused",
                activeNodeId: status.node_id,
                pausedPrompt: status.prompt,
              });
              return;

            case "error":
              reconnecting = false;
              set({
                runStatus: "error",
                errorMessage: status.error ?? "Run failed on server",
                activeNodeId: null,
              });
              return;
          }
        } catch {
          // Status check failed — continue to next attempt
        }
      }

      // All attempts exhausted
      reconnecting = false;
      set({
        runStatus: "connection_lost",
        errorMessage: "Connection lost after 3 attempts",
      });
      showToast("Connection lost — run may still be executing on the server");
    })().catch(() => {
      // Safety net — ensure we always land in a terminal state
      reconnecting = false;
      set({
        runStatus: "connection_lost",
        errorMessage: "Connection lost unexpectedly",
      });
    });
  },

  _disconnect: () => {
    cleanup?.();
    cleanup = null;
  },
}));
