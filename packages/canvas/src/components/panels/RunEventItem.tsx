import type { GraphEvent } from "@shared/events";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Circle,
  Loader,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
import { formatDuration } from "../../utils/format";

interface RunEventItemProps {
  event: GraphEvent;
}

export function RunEventItem({ event }: RunEventItemProps) {
  switch (event.event) {
    case "run_started":
      return (
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Play size={12} />
          <span>Run started</span>
        </div>
      );

    case "node_started":
      return (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <Loader size={12} className="animate-spin" />
          <span>{event.data.node_id}</span>
        </div>
      );

    case "node_completed":
      return (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <CheckCircle size={12} />
          <span>
            {event.data.node_id}{" "}
            <span className="text-zinc-500">
              {formatDuration(event.data.duration_ms)}
            </span>
          </span>
        </div>
      );

    case "edge_traversed":
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <ArrowRight size={12} />
          <span>
            {event.data.from} → {event.data.to}
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
      return (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <CheckCircle size={12} />
          <span>
            Completed{" "}
            <span className="text-zinc-500">
              {formatDuration(event.data.duration_ms)}
            </span>
          </span>
        </div>
      );

    case "error":
      return (
        <div className="flex items-center gap-2 text-xs text-red-400">
          {event.data.recoverable ? (
            <AlertTriangle size={12} />
          ) : (
            <XCircle size={12} />
          )}
          <span>{event.data.message}</span>
        </div>
      );

    default:
      return (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Circle size={12} />
          <span>Unknown event</span>
        </div>
      );
  }
}
