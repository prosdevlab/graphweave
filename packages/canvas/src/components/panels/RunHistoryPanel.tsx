import type { RunStatus } from "@api/runs";
import { useCanvasContext } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { useHistoryStore } from "@store/historySlice";
import { useRunStore } from "@store/runSlice";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { formatDuration } from "../../utils/format";

const STATUS_FILTERS: { label: string; value: RunStatus | null }[] = [
  { label: "All", value: null },
  { label: "Completed", value: "completed" },
  { label: "Error", value: "error" },
  { label: "Paused", value: "paused" },
];

const STATUS_ICON: Record<
  RunStatus,
  { icon: typeof CheckCircle2; color: string }
> = {
  completed: { icon: CheckCircle2, color: "text-emerald-400" },
  error: { icon: AlertCircle, color: "text-red-400" },
  paused: { icon: Pause, color: "text-amber-400" },
  running: { icon: Loader2, color: "text-indigo-400" },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RunHistoryPanel() {
  const graphId = useGraphStore((s) => s.graph?.id);
  const runs = useHistoryStore((s) => s.runs);
  const total = useHistoryStore((s) => s.total);
  const loading = useHistoryStore((s) => s.loading);
  const error = useHistoryStore((s) => s.error);
  const statusFilter = useHistoryStore((s) => s.statusFilter);
  const loadRuns = useHistoryStore((s) => s.loadRuns);
  const setStatusFilter = useHistoryStore((s) => s.setStatusFilter);
  const deleteRun = useHistoryStore((s) => s.deleteRun);
  const liveRunStatus = useRunStore((s) => s.runStatus);

  const { setBottomPanelVisible, setActiveBottomTab } = useCanvasContext();

  // Load runs on mount and when filter changes
  // statusFilter is read by loadRuns() via get(), but listed as dep to trigger reload
  useEffect(() => {
    void statusFilter; // trigger re-fetch when filter changes
    if (graphId) loadRuns(graphId);
  }, [graphId, loadRuns, statusFilter]);

  // Refresh when a live run reaches a terminal state
  const prevLiveStatus = useRef(liveRunStatus);
  useEffect(() => {
    const prev = prevLiveStatus.current;
    prevLiveStatus.current = liveRunStatus;
    const wasActive =
      prev === "running" || prev === "paused" || prev === "reconnecting";
    const isTerminal =
      liveRunStatus === "completed" || liveRunStatus === "error";
    if (wasActive && isTerminal && graphId) {
      loadRuns(graphId);
    }
  }, [liveRunStatus, graphId, loadRuns]);

  const handleRowClick = useCallback(() => {
    setBottomPanelVisible(true);
    setActiveBottomTab("timeline");
  }, [setBottomPanelVisible, setActiveBottomTab]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, runId: string) => {
      e.stopPropagation();
      deleteRun(runId);
    },
    [deleteRun],
  );

  const handleFilterClick = useCallback(
    (value: RunStatus | null) => {
      setStatusFilter(value);
    },
    [setStatusFilter],
  );

  if (loading && runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
        <Loader2 size={16} className="mr-2 animate-spin" />
        Loading runs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-800 bg-red-950/50 p-3 text-xs text-red-300">
        {error}
      </div>
    );
  }

  return (
    <>
      {/* Status filter chips */}
      <div className="mb-3 flex gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => handleFilterClick(f.value)}
            className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${
              statusFilter === f.value
                ? "bg-indigo-500/20 text-indigo-300"
                : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {runs.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">
          {statusFilter
            ? `No ${statusFilter} runs found.`
            : "No runs yet. Click Run to execute your graph."}
        </p>
      ) : (
        <div className="space-y-1">
          {runs.map((run) => {
            const { icon: Icon, color } = STATUS_ICON[run.status];
            const isActive =
              run.status === "running" || run.status === "paused";
            return (
              <button
                key={run.id}
                type="button"
                onClick={handleRowClick}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-800"
              >
                <Icon
                  size={14}
                  className={`shrink-0 ${color} ${run.status === "running" ? "animate-spin" : ""}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                    <span className="font-mono text-zinc-500">
                      #{run.id.slice(0, 6)}
                    </span>
                    <span className="text-zinc-600">&middot;</span>
                    <span className="text-zinc-500">
                      {formatTimestamp(run.created_at)}
                    </span>
                    {run.duration_ms != null && (
                      <>
                        <span className="text-zinc-600">&middot;</span>
                        <span className="text-zinc-500">
                          {formatDuration(run.duration_ms)}
                        </span>
                      </>
                    )}
                  </div>
                  {run.error && (
                    <p className="mt-0.5 truncate text-[11px] text-red-400/80">
                      {run.error}
                    </p>
                  )}
                </div>
                {!isActive && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, run.id)}
                    className="shrink-0 rounded p-1 text-zinc-600 hover:text-red-400"
                    aria-label={`Delete run ${run.id.slice(0, 6)}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </button>
            );
          })}
          {total > runs.length && (
            <p className="pt-2 text-center text-[11px] text-zinc-600">
              Showing {runs.length} of {total} runs
            </p>
          )}
        </div>
      )}
    </>
  );
}
