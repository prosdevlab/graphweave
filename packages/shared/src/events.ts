/** SSE event types emitted by the execution layer. */

export type GraphEvent =
  | { event: "run_started"; data: { run_id: string; timestamp: string } }
  | { event: "node_started"; data: { node_id: string; timestamp: string } }
  | {
      event: "node_completed";
      data: {
        node_id: string;
        output: unknown;
        state_snapshot: unknown;
        duration_ms: number;
      };
    }
  | {
      event: "edge_traversed";
      data: { from: string; to: string; condition_result?: string };
    }
  | {
      event: "graph_paused";
      data: { node_id: string; prompt: string; run_id: string };
    }
  | {
      event: "graph_completed";
      data: { final_state: unknown; duration_ms: number };
    }
  | {
      event: "error";
      data: {
        node_id?: string;
        message: string;
        recoverable: boolean;
        title?: string;
      };
    };
