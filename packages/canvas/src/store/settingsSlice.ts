import {
  type ProviderStatus,
  type ToolInfo,
  getProviders,
  getTools,
} from "@api/settings";
import { create } from "zustand";

export interface SettingsSlice {
  tools: ToolInfo[];
  toolsLoaded: boolean;
  toolsError: string | null;
  loadTools: () => Promise<void>;

  providers: Record<string, ProviderStatus> | null;
  providersLoaded: boolean;
  providersError: string | null;
  loadProviders: () => Promise<void>;
}

export const useSettingsStore = create<SettingsSlice>((set, get) => ({
  tools: [],
  toolsLoaded: false,
  toolsError: null,

  loadTools: async () => {
    if (get().toolsLoaded) return;
    try {
      const tools = await getTools();
      set({ tools, toolsLoaded: true, toolsError: null });
    } catch (err) {
      set({
        toolsError: err instanceof Error ? err.message : "Failed to load tools",
      });
    }
  },

  providers: null,
  providersLoaded: false,
  providersError: null,

  loadProviders: async () => {
    if (get().providersLoaded) return;
    try {
      const providers = await getProviders();
      set({ providers, providersLoaded: true, providersError: null });
    } catch (err) {
      set({
        providersError:
          err instanceof Error ? err.message : "Failed to load providers",
      });
    }
  },
}));
