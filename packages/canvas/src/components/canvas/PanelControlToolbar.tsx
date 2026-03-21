import { usePanelStore } from "@store/panelSlice";
import { Tooltip } from "@ui/Tooltip";
import { PanelBottom, PanelLeft, PanelRight } from "lucide-react";

export function PanelControlToolbar() {
  const sidePanelVisible = usePanelStore((s) => s.sidePanelVisible);
  const setSidePanelVisible = usePanelStore((s) => s.setSidePanelVisible);
  const bottomPanelVisible = usePanelStore((s) => s.bottomPanelVisible);
  const setBottomPanelVisible = usePanelStore((s) => s.setBottomPanelVisible);

  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/80 p-1 backdrop-blur-sm">
      <Tooltip content="Left Panel" side="bottom">
        <button
          type="button"
          disabled
          className="flex h-6 w-6 cursor-not-allowed items-center justify-center rounded text-zinc-600"
          aria-label="Toggle left panel"
        >
          <PanelLeft size={16} />
        </button>
      </Tooltip>

      <Tooltip content="Bottom Panel" side="bottom">
        <button
          type="button"
          onClick={() => setBottomPanelVisible(!bottomPanelVisible)}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
            bottomPanelVisible
              ? "text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Toggle bottom panel"
          aria-pressed={bottomPanelVisible}
        >
          <PanelBottom size={16} />
        </button>
      </Tooltip>

      <Tooltip content="Right Panel" side="bottom">
        <button
          type="button"
          onClick={() => setSidePanelVisible(!sidePanelVisible)}
          className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors ${
            sidePanelVisible
              ? "text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Toggle right panel"
          aria-pressed={sidePanelVisible}
        >
          <PanelRight size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
