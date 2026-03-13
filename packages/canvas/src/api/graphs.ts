/** Graph CRUD service layer. */

import type { GraphSchema } from "@shared/schema";
import { request } from "./client";

export async function listGraphs(): Promise<GraphSchema[]> {
  return request<GraphSchema[]>("/graphs");
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
