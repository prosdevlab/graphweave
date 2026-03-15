import { create } from "zustand";

type AppView = "home" | "canvas";

export interface UISlice {
  darkMode: boolean;
  panelLayout: "right" | "bottom";
  lastOpenedGraphId: string | null;
  currentView: AppView;
  newGraphDialogOpen: boolean;
  toggleDarkMode: () => void;
  setPanelLayout: (layout: "right" | "bottom") => void;
  setLastOpenedGraphId: (id: string | null) => void;
  setView: (view: AppView) => void;
  setNewGraphDialogOpen: (open: boolean) => void;
}

export const useUIStore = create<UISlice>((set) => ({
  darkMode: true,
  panelLayout: "right",
  lastOpenedGraphId: null,
  currentView: "home",
  newGraphDialogOpen: false,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setPanelLayout: (layout) => set({ panelLayout: layout }),
  setLastOpenedGraphId: (id) => set({ lastOpenedGraphId: id }),
  setView: (view) => set({ currentView: view }),
  setNewGraphDialogOpen: (open) => set({ newGraphDialogOpen: open }),
}));
