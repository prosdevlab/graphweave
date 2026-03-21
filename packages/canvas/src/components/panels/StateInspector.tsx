import { useCanvasContext } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { useHistoryStore } from "@store/historySlice";
import { useRunStore } from "@store/runSlice";
import { useMemo } from "react";
import { JsonTree } from "./JsonTree";

type DiffBadge = "new" | "modified" | "removed" | "unchanged";

function computeDiff(
  prev: Record<string, unknown> | null,
  current: Record<string, unknown>,
): Map<string, DiffBadge> {
  const badges = new Map<string, DiffBadge>();
  if (!prev) {
    for (const key of Object.keys(current)) {
      badges.set(key, "new");
    }
    return badges;
  }
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);
  for (const key of allKeys) {
    if (!(key in prev)) {
      badges.set(key, "new");
    } else if (!(key in current)) {
      badges.set(key, "removed");
    } else if (JSON.stringify(prev[key]) !== JSON.stringify(current[key])) {
      badges.set(key, "modified");
    } else {
      badges.set(key, "unchanged");
    }
  }
  return badges;
}

export function StateInspector() {
  const { selectedNodeId } = useCanvasContext();
  const runOutput = useRunStore((s) => s.runOutput);
  const runStatus = useRunStore((s) => s.runStatus);
  const activeNodeId = useRunStore((s) => s.activeNodeId);
  const finalState = useRunStore((s) => s.finalState);
  const nodes = useGraphStore((s) => s.nodes);
  const inspectedRun = useHistoryStore((s) => s.inspectedRun);

  // Find node label
  const nodeLabel = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId)?.label ?? selectedNodeId;
  }, [selectedNodeId, nodes]);

  // Extract state snapshot for the selected node from live run events
  const { snapshot, prevSnapshot } = useMemo(() => {
    if (!selectedNodeId) return { snapshot: null, prevSnapshot: null };

    let targetIdx = -1;
    for (let i = runOutput.length - 1; i >= 0; i--) {
      const ev = runOutput[i];
      if (
        ev?.event === "node_completed" &&
        ev.data.node_id === selectedNodeId
      ) {
        targetIdx = i;
        break;
      }
    }

    if (targetIdx === -1) return { snapshot: null, prevSnapshot: null };

    const snap = runOutput[targetIdx];
    if (snap?.event !== "node_completed")
      return { snapshot: null, prevSnapshot: null };

    let prev: unknown = null;
    for (let i = targetIdx - 1; i >= 0; i--) {
      const ev = runOutput[i];
      if (ev?.event === "node_completed") {
        prev = ev.data.state_snapshot;
        break;
      }
    }

    return {
      snapshot: snap.data.state_snapshot as Record<string, unknown> | null,
      prevSnapshot: prev as Record<string, unknown> | null,
    };
  }, [selectedNodeId, runOutput]);

  // Historical run: show inspected run's final_state
  if (inspectedRun) {
    const status = inspectedRun.status;
    const statusLabel =
      status === "completed"
        ? "Completed"
        : status === "error"
          ? "Failed"
          : status === "paused"
            ? "Paused"
            : "Running";

    return (
      <div className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-semibold text-zinc-300">
            Run #{inspectedRun.run_id.slice(0, 6)}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              status === "completed"
                ? "bg-emerald-500/10 text-emerald-400"
                : status === "error"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-zinc-700/30 text-zinc-400"
            }`}
          >
            {statusLabel}
          </span>
        </div>

        {inspectedRun.error && (
          <div className="mb-3 rounded border border-red-800 bg-red-950/50 p-2 text-[11px] text-red-400">
            {inspectedRun.error}
          </div>
        )}

        {inspectedRun.final_state ? (
          <>
            <p className="mb-2 text-[10px] text-zinc-500">
              Final graph state. Per-node snapshots are only available during
              live runs.
            </p>
            <JsonTree
              data={inspectedRun.final_state}
              label="state"
              defaultExpanded
            />
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            No state data available for this run.
          </p>
        )}
      </div>
    );
  }

  // No node selected
  if (!selectedNodeId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Click a node in the timeline to inspect its state.
      </div>
    );
  }

  // Node is still executing (Fix: better message for in-progress nodes)
  const isNodeExecuting =
    runStatus === "running" && selectedNodeId === activeNodeId;
  if (!snapshot && isNodeExecuting) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Node is still executing. Snapshot will appear when it completes.
      </div>
    );
  }

  // No snapshot available (completed run without per-node data)
  if (!snapshot) {
    if ((runStatus === "completed" || runStatus === "error") && finalState) {
      return (
        <div className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold text-zinc-300">Final State</h3>
          </div>
          <p className="mb-3 text-[10px] text-zinc-500">
            Per-node snapshots are available for live runs. Showing final graph
            state.
          </p>
          <JsonTree data={finalState} label="state" defaultExpanded />
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        No state snapshot for this node.
      </div>
    );
  }

  // Compute diff badges (memoized to avoid re-stringify on every render)
  const badges = useMemo(
    () => computeDiff(prevSnapshot, snapshot),
    [prevSnapshot, snapshot],
  );

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-zinc-300">
          Node: {nodeLabel}
        </h3>
      </div>

      <div className="mb-3 flex gap-3 text-[10px] text-zinc-500">
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-zinc-700/50" />{" "}
          unchanged
        </span>
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-emerald-500/30" />{" "}
          added
        </span>
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-amber-500/30" />{" "}
          modified
        </span>
        <span>
          <span className="mr-0.5 inline-block h-2 w-2 rounded-sm bg-red-500/30" />{" "}
          removed
        </span>
      </div>

      <h4 className="mb-1 text-[11px] font-medium text-zinc-400">
        State after this node:
      </h4>
      <div className="space-y-0">
        {Object.entries(snapshot).map(([key, value]) => (
          <JsonTree
            key={key}
            data={value}
            label={key}
            badge={badges.get(key) ?? null}
            defaultExpanded={
              badges.get(key) === "new" || badges.get(key) === "modified"
            }
          />
        ))}
      </div>
    </div>
  );
}
