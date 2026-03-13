/** Core SDK types and plugin system for GraphWeave. */

export interface PluginContext {
  id: string;
  name: string;
  version: string;
}

export interface Plugin {
  context: PluginContext;
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}
