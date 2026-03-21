import {
  type PaginatedRuns,
  type RunListItem,
  type RunStatus,
  type RunStatusResponse,
  deleteRun as apiDeleteRun,
  getRunStatus,
  listRunsForGraph,
} from "@api/runs";
import { create } from "zustand";

export type { RunStatus } from "@api/runs";

export interface HistorySlice {
  runs: RunListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  statusFilter: RunStatus | null;

  /** The historical run currently being inspected (null = showing live run) */
  inspectedRun: RunStatusResponse | null;

  loadRuns: (graphId: string) => Promise<void>;
  setStatusFilter: (status: RunStatus | null) => void;
  deleteRun: (runId: string) => Promise<void>;
  inspectRun: (runId: string) => Promise<void>;
  clearInspectedRun: () => void;
  reset: () => void;
}

const PAGE_SIZE = 20;

export const useHistoryStore = create<HistorySlice>((set, get) => ({
  runs: [],
  total: 0,
  loading: false,
  error: null,
  statusFilter: null,
  inspectedRun: null,

  loadRuns: async (graphId: string) => {
    set({ loading: true, error: null });
    try {
      const { statusFilter } = get();
      const result: PaginatedRuns = await listRunsForGraph(graphId, {
        status: statusFilter ?? undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      set({ runs: result.items, total: result.total, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load runs",
        loading: false,
      });
    }
  },

  setStatusFilter: (status: RunStatus | null) => {
    set({ statusFilter: status });
  },

  deleteRun: async (runId: string) => {
    try {
      await apiDeleteRun(runId);
      set((s) => ({
        runs: s.runs.filter((r) => r.id !== runId),
        total: s.total - 1,
        // Clear inspected run if it was the deleted one
        inspectedRun: s.inspectedRun?.run_id === runId ? null : s.inspectedRun,
      }));
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to delete run",
      });
    }
  },

  inspectRun: async (runId: string) => {
    // If already inspecting this run, skip
    if (get().inspectedRun?.run_id === runId) return;
    set({ error: null });
    try {
      const status = await getRunStatus(runId);
      set({ inspectedRun: status });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to load run details",
      });
    }
  },

  clearInspectedRun: () => {
    set({ inspectedRun: null });
  },

  reset: () => {
    set({
      runs: [],
      total: 0,
      loading: false,
      error: null,
      statusFilter: null,
      inspectedRun: null,
    });
  },
}));
