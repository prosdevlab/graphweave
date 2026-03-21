import { useGraphStore } from "@store/graphSlice";
import { useRunStore } from "@store/runSlice";
import { Copy } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { ResumeForm } from "./ResumeForm";
import type { NodeMapEntry } from "./RunEventItem";
import { RunEventItem } from "./RunEventItem";

export function RunPanel() {
  const runStatus = useRunStore((s) => s.runStatus);
  const runOutput = useRunStore((s) => s.runOutput);
  const errorMessage = useRunStore((s) => s.errorMessage);
  const errorTitle = useRunStore((s) => s.errorTitle);
  const pausedPrompt = useRunStore((s) => s.pausedPrompt);
  const nodes = useGraphStore((s) => s.nodes);

  const endRef = useRef<HTMLDivElement>(null);

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

  if (runStatus === "idle" && runOutput.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Run your graph to see execution events here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 p-4">
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
        <div className="mt-2 rounded border border-red-800 bg-red-950/50 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-red-300">
              {errorTitle ?? "Run failed"}
            </span>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(errorMessage)}
              className="rounded p-0.5 text-red-500 hover:text-red-300"
              aria-label="Copy error message"
            >
              <Copy size={11} />
            </button>
          </div>
          <p className="border-l-2 border-red-700 pl-2 font-mono text-[11px] text-red-400">
            {errorMessage}
          </p>
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
  );
}
