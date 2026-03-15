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

// Fixes pre-existing bug: backend returns PaginatedResponse, not a flat array
export async function listGraphs(): Promise<GraphSchema[]> {
  const response = await request<PaginatedResponse<GraphSchema>>("/graphs");
  return response.items;
}

export async function getGraph(id: string): Promise<GraphSchema> {
  return request<GraphSchema>(`/graphs/${id}`);
}

export async function createGraph(
  graph: Omit<GraphSchema, "id" | "metadata">,
): Promise<GraphSchema> {
  return request<GraphSchema>("/graphs", {
    method: "POST",
    body: JSON.stringify(graph),
  });
}

export async function updateGraph(
  id: string,
  graph: Partial<Omit<GraphSchema, "id" | "metadata">>,
): Promise<GraphSchema> {
  return request<GraphSchema>(`/graphs/${id}`, {
    method: "PUT",
    body: JSON.stringify(graph),
  });
}

export async function deleteGraph(id: string): Promise<void> {
  await request<void>(`/graphs/${id}`, { method: "DELETE" });
}
