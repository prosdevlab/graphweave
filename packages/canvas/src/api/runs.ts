/** Run management and SSE streaming service layer. */

import { request } from "./client";

export async function startRun(
  graphId: string,
  input: unknown,
): Promise<{ run_id: string }> {
  return request<{ run_id: string }>(`/graphs/${graphId}/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function connectStream(
  runId: string,
  handlers: {
    onMessage: (event: string, data: unknown) => void;
    onError: (error: Event) => void;
  },
): EventSource {
  const source = new EventSource(`/api/graphs/run/${runId}/stream`);
  source.onmessage = (e) => {
    const parsed = JSON.parse(e.data);
    handlers.onMessage(parsed.event, parsed.data);
  };
  source.onerror = handlers.onError;
  return source;
}
