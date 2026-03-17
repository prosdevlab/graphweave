import { request } from "./client";

export interface ToolInfo {
  name: string;
  description: string;
}

export interface ProviderStatus {
  configured: boolean;
  models: string[];
}

export function getTools(): Promise<ToolInfo[]> {
  return request<ToolInfo[]>("/settings/tools");
}

export function getProviders(): Promise<Record<string, ProviderStatus>> {
  return request<Record<string, ProviderStatus>>("/settings/providers");
}
