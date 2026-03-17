import { useGraphStore } from "@store/graphSlice";
import { useRunStore } from "@store/runSlice";
import { Sheet } from "@ui/Sheet";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDuration } from "../../utils/format";
import { ResumeForm } from "./ResumeForm";
import type { NodeMapEntry } from "./RunEventItem";
import { RunEventItem } from "./RunEventItem";

export function RunPanel() {
  const runStatus = useRunStore((s) => s.runStatus);
  const runOutput = useRunStore((s) => s.runOutput);
  const durationMs = useRunStore((s) => s.durationMs);
  const errorMessage = useRunStore((s) => s.errorMessage);
  const pausedPrompt = useRunStore((s) => s.pausedPrompt);
  const nodes = useGraphStore((s) => s.nodes);
  const [visible, setVisible] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  // Auto-open when run starts, keep open until dismissed
  useEffect(() => {
    if (runStatus !== "idle") {
      setVisible(true);
    }
  }, [runStatus]);

  // Auto-scroll to bottom on new events
  const eventCount = runOutput.length;
  useEffect(() => {
    if (eventCount > 0) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [eventCount]);

  // Build set of node IDs that have completed (to hide their node_started spinner)
  const completedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of runOutput) {
      if (e.event === "node_completed") {
        ids.add(e.data.node_id);
      }
    }
    return ids;
  }, [runOutput]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, NodeMapEntry>();
    for (const n of nodes) {
      m.set(n.id, { label: n.label, type: n.type, config: n.config });
    }
    return m;
  }, [nodes]);

  if (runStatus === "idle" && !visible) return null;

  const title =
    runStatus === "completed"
      ? `Run completed ${formatDuration(durationMs)}`
      : runStatus === "error"
        ? "Run failed"
        : runStatus === "paused"
          ? "Run paused"
          : runStatus === "connection_lost"
            ? "Connection lost"
            : "Running...";

  return (
    <Sheet
      open={visible}
      onClose={() => setVisible(false)}
      title={title}
      side="bottom"
    >
      <div className="flex flex-col gap-1.5">
        {runOutput.map((event, i) => (
          <RunEventItem
            // biome-ignore lint/suspicious/noArrayIndexKey: events are append-only, index is stable
            key={i}
            event={event}
            completedNodeIds={completedNodeIds}
            nodeMap={nodeMap}
          />
        ))}
        {runStatus === "error" && errorMessage && (
          <div className="mt-2 rounded border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
            {errorMessage}
          </div>
        )}
        {runStatus === "connection_lost" && (
          <div className="mt-2 rounded border border-amber-800 bg-amber-950/50 px-3 py-2 text-xs text-amber-400">
            Connection lost — the run may still be executing on the server.
          </div>
        )}
        {runStatus === "paused" && pausedPrompt && (
          <ResumeForm
            prompt={pausedPrompt}
            onSubmit={(input) => useRunStore.getState().resumeRun(input)}
          />
        )}
        <div ref={endRef} />
      </div>
    </Sheet>
  );
}
