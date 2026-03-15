import { useGraphStore } from "@store/graphSlice";
import { useEffect } from "react";

/** Warns the user before closing/navigating away with unsaved changes. */
export function useBeforeUnload() {
  const dirty = useGraphStore((s) => s.dirty);

  useEffect(() => {
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
