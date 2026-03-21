import {
  type PaginatedRuns,
  type RunListItem,
  type RunStatus,
  deleteRun as apiDeleteRun,
  listRunsForGraph,
} from "@api/runs";
import { create } from "zustand";

export interface HistorySlice {
  runs: RunListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  statusFilter: RunStatus | null;

  loadRuns: (graphId: string) => Promise<void>;
  setStatusFilter: (status: RunStatus | null) => void;
  deleteRun: (runId: string) => Promise<void>;
  reset: () => void;
}

const PAGE_SIZE = 20;

export const useHistoryStore = create<HistorySlice>((set, get) => ({
  runs: [],
  total: 0,
  loading: false,
  error: null,
  statusFilter: null,

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
      }));
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Failed to delete run",
      });
    }
  },

  reset: () => {
    set({
      runs: [],
      total: 0,
      loading: false,
      error: null,
      statusFilter: null,
    });
  },
}));
