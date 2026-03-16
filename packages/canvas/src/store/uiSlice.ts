import { create } from "zustand";

export type ToastVariant = "error" | "success" | "info";

export interface UISlice {
  darkMode: boolean;
  panelLayout: "right" | "bottom";
  lastOpenedGraphId: string | null;
  newGraphDialogOpen: boolean;
  toastMessage: string | null;
  toastVariant: ToastVariant;
  toggleDarkMode: () => void;
  setPanelLayout: (layout: "right" | "bottom") => void;
  setLastOpenedGraphId: (id: string | null) => void;
  setNewGraphDialogOpen: (open: boolean) => void;
  showToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: () => void;
}

export const useUIStore = create<UISlice>((set) => ({
  darkMode: true,
  panelLayout: "right",
  lastOpenedGraphId: null,
  newGraphDialogOpen: false,
  toastMessage: null,
  toastVariant: "info",
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setPanelLayout: (layout) => set({ panelLayout: layout }),
  setLastOpenedGraphId: (id) => set({ lastOpenedGraphId: id }),
  setNewGraphDialogOpen: (open) => set({ newGraphDialogOpen: open }),
  showToast: (message, variant = "info") =>
    set({ toastMessage: message, toastVariant: variant }),
  dismissToast: () => set({ toastMessage: null }),
}));
