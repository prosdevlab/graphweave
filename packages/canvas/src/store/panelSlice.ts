import { create } from "zustand";

export type SidePanelId = "config" | "state" | "history" | "schema";
export type BottomTab = "timeline" | "debug";

export interface PanelSlice {
  activeSidePanel: SidePanelId | null;
  sidePanelVisible: boolean;
  bottomPanelVisible: boolean;
  bottomPanelMinimized: boolean;
  activeBottomTab: BottomTab;

  toggleSidePanel: (panel: SidePanelId) => void;
  openSidePanel: (panel: SidePanelId) => void;
  closeSidePanel: () => void;
  setSidePanelVisible: (visible: boolean) => void;
  toggleBottomPanel: () => void;
  setBottomPanelVisible: (visible: boolean) => void;
  setBottomPanelMinimized: (minimized: boolean) => void;
  setActiveBottomTab: (tab: BottomTab) => void;
}

export const usePanelStore = create<PanelSlice>((set, get) => ({
  activeSidePanel: null,
  sidePanelVisible: false,
  bottomPanelVisible: false,
  bottomPanelMinimized: false,
  activeBottomTab: "timeline",

  toggleSidePanel: (panel: SidePanelId) => {
    const { activeSidePanel, sidePanelVisible } = get();
    if (activeSidePanel === panel && sidePanelVisible) {
      set({ sidePanelVisible: false });
    } else {
      set({ activeSidePanel: panel, sidePanelVisible: true });
    }
  },

  openSidePanel: (panel: SidePanelId) => {
    set({ activeSidePanel: panel, sidePanelVisible: true });
  },

  closeSidePanel: () => {
    set({ sidePanelVisible: false });
  },

  setSidePanelVisible: (visible: boolean) => {
    set({ sidePanelVisible: visible });
  },

  toggleBottomPanel: () => {
    set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible }));
  },

  setBottomPanelVisible: (visible: boolean) => {
    set({ bottomPanelVisible: visible });
  },

  setBottomPanelMinimized: (minimized: boolean) => {
    set({ bottomPanelMinimized: minimized });
  },

  setActiveBottomTab: (tab: BottomTab) => {
    set({ activeBottomTab: tab });
  },
}));
