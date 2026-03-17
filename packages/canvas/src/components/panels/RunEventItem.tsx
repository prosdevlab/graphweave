import type { GraphEvent } from "@shared/events";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  Loader,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
import { formatDuration, formatTime } from "../../utils/format";

const MAX_OUTPUT_LENGTH = 2000;

export interface NodeMapEntry {
  label: string;
  type: string;
  config: Record<string, unknown>;
}

interface RunEventItemProps {
  event: GraphEvent;
  /** Set of node IDs that have a node_completed event later in the list */
  completedNodeIds?: Set<string>;
  /** Map from node ID to label/type/config */
  nodeMap?: Map<string, NodeMapEntry>;
}

function Timestamp({ iso }: { iso?: string }) {
  const text = formatTime(iso);
  if (!text) return null;
  return <span className="ml-auto shrink-0 text-zinc-600">{text}</span>;
}

function resolveLabel(
  nodeId: string,
  nodeMap?: Map<string, NodeMapEntry>,
): string {
  return nodeMap?.get(nodeId)?.label ?? nodeId;
}

export function RunEventItem({
  event,
  completedNodeIds,
  nodeMap,
}: RunEventItemProps) {
  switch (event.event) {
    case "run_started":
      return (
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Play size={12} />
          <span>Run started</span>
          <Timestamp iso={event.data.timestamp} />
        </div>
      );

    case "node_started": {
      const done = completedNodeIds?.has(event.data.node_id);
      if (done) return null;
      return (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <Loader size={12} className="animate-spin" />
          <span>{resolveLabel(event.data.node_id, nodeMap)}</span>
          <Timestamp iso={event.data.timestamp} />
        </div>
      );
    }

    case "node_completed": {
      const label = resolveLabel(event.data.node_id, nodeMap);
      const entry = nodeMap?.get(event.data.node_id);
      const output = event.data.output as Record<string, unknown> | null;
      const rawOutput = output
        ? Object.values(output)
            .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
            .join("\n")
        : null;
      const outputTruncated = rawOutput && rawOutput.length > MAX_OUTPUT_LENGTH;
      const outputText = outputTruncated
        ? `${rawOutput.slice(0, MAX_OUTPUT_LENGTH)}…`
        : rawOutput;

      const showProviderModel: boolean =
        entry?.type === "llm" &&
        Boolean(entry.config.provider) &&
        Boolean(entry.config.model);

      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-green-400">
            <Check size={12} />
            <span>
              {label}{" "}
              <span className="text-zinc-500">
                {formatDuration(event.data.duration_ms)}
              </span>
            </span>
          </div>
          {showProviderModel && entry && (
            <div className="ml-5 text-xs text-zinc-500">
              {String(entry.config.provider)} &middot;{" "}
              {String(entry.config.model)}
            </div>
          )}
          {outputText && (
            <pre className="ml-5 whitespace-pre-wrap rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300">
              {outputText}
            </pre>
          )}
        </div>
      );
    }

    case "edge_traversed":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <ArrowRight size={12} />
          <span>
            {resolveLabel(event.data.from, nodeMap)} &rarr;{" "}
            {resolveLabel(event.data.to, nodeMap)}
          </span>
        </div>
      );

    case "graph_paused":
      return (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <Pause size={12} />
          <span>Paused: {event.data.prompt}</span>
        </div>
      );

    case "graph_completed":
      return null;

    case "error": {
      const nodeLabel = event.data.node_id
        ? resolveLabel(event.data.node_id, nodeMap)
        : null;
      return (
        <div className="flex items-center gap-2 text-xs text-red-400">
          {event.data.recoverable ? (
            <AlertTriangle size={12} />
          ) : (
            <XCircle size={12} />
          )}
          <span>
            {nodeLabel ? `${nodeLabel}: ` : ""}
            {event.data.message}
          </span>
        </div>
      );
    }

    default:
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Circle size={12} />
          <span>Unknown event</span>
        </div>
      );
  }
}
