import { create } from "zustand";

export interface UISlice {
  darkMode: boolean;
  panelLayout: "right" | "bottom";
  lastOpenedGraphId: string | null;
  toggleDarkMode: () => void;
  setPanelLayout: (layout: "right" | "bottom") => void;
  setLastOpenedGraphId: (id: string | null) => void;
}

export const useUIStore = create<UISlice>((set) => ({
  darkMode: true,
  panelLayout: "right",
  lastOpenedGraphId: null,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setPanelLayout: (layout) => set({ panelLayout: layout }),
  setLastOpenedGraphId: (id) => set({ lastOpenedGraphId: id }),
}));
