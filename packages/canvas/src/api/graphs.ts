/** Graph CRUD service layer. */

import type { GraphSchema } from "@shared/schema";
import { request } from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/** Backend response shape for graph endpoints */
interface GraphResponse {
  id: string;
  name: string;
  schema_json: GraphSchema;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

/** Convert backend response to frontend GraphSchema */
function toGraphSchema(res: GraphResponse): GraphSchema {
  return {
    ...res.schema_json,
    id: res.id,
    name: res.name,
    metadata: {
      ...res.schema_json.metadata,
      created_at: res.created_at,
      updated_at: res.updated_at,
    },
  };
}

// Fixes pre-existing bug: backend returns PaginatedResponse, not a flat array
export async function listGraphs(): Promise<GraphSchema[]> {
  const response = await request<PaginatedResponse<GraphResponse>>("/graphs");
  return response.items.map(toGraphSchema);
}

export async function getGraph(id: string): Promise<GraphSchema> {
  const res = await request<GraphResponse>(`/graphs/${encodeURIComponent(id)}`);
  return toGraphSchema(res);
}

export async function createGraph(
  graph: Omit<GraphSchema, "id" | "metadata">,
): Promise<GraphSchema> {
  const res = await request<GraphResponse>("/graphs", {
    method: "POST",
    body: JSON.stringify({
      name: graph.name,
      schema_json: graph,
    }),
  });
  return toGraphSchema(res);
}

export async function updateGraph(
  id: string,
  graph: Partial<Omit<GraphSchema, "id" | "metadata">>,
): Promise<GraphSchema> {
  const res = await request<GraphResponse>(
    `/graphs/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: graph.name,
        schema_json: graph,
      }),
    },
  );
  return toGraphSchema(res);
}

export async function deleteGraph(id: string): Promise<void> {
  await request<void>(`/graphs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
