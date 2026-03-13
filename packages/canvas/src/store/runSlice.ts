import type { GraphEvent } from "@shared/events";
import { create } from "zustand";

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
  startRun: (input: unknown) => Promise<void>;
  resumeRun: (input: string) => Promise<void>;
  cancelRun: () => void;
}

export const useRunStore = create<RunSlice>((set) => ({
  activeRunId: null,
  runStatus: "idle",
  activeNodeId: null,
  runOutput: [],
  reconnectAttempts: 0,
  startRun: async (_input) => {
    set({ runStatus: "running" });
    // TODO: implement SSE connection
  },
  resumeRun: async (_input) => {
    // TODO: implement resume flow
  },
  cancelRun: () => {
    set({ runStatus: "idle", activeRunId: null });
  },
}));
