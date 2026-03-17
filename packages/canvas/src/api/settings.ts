import { request } from "./client";

export interface ToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string | null;
  examples?: string[] | null;
}

export interface ToolInfo {
  name: string;
  description: string;
  parameters: ToolParameter[];
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
