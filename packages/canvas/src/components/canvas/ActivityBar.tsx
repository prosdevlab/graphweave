import type { SidePanelId } from "@store/panelSlice";
import { usePanelStore } from "@store/panelSlice";
import { Tooltip } from "@ui/Tooltip";
import { Braces, Clock, Database, Settings, Terminal } from "lucide-react";

const SIDE_ITEMS: {
  id: SidePanelId;
  icon: typeof Settings;
  label: string;
  shortcut: string;
}[] = [
  { id: "config", icon: Settings, label: "Node Config", shortcut: "⌘1" },
  { id: "state", icon: Database, label: "State Fields", shortcut: "⌘2" },
  { id: "history", icon: Clock, label: "Run History", shortcut: "⌘3" },
  { id: "schema", icon: Braces, label: "Schema", shortcut: "⌘4" },
];

export function ActivityBar() {
  const activeSidePanel = usePanelStore((s) => s.activeSidePanel);
  const sidePanelVisible = usePanelStore((s) => s.sidePanelVisible);
  const toggleSidePanel = usePanelStore((s) => s.toggleSidePanel);
  const bottomPanelVisible = usePanelStore((s) => s.bottomPanelVisible);
  const toggleBottomPanel = usePanelStore((s) => s.toggleBottomPanel);

  return (
    <div className="flex w-10 shrink-0 flex-col items-center justify-between border-r border-zinc-800 bg-zinc-950 py-2">
      <div className="flex flex-col items-center gap-1">
        {SIDE_ITEMS.map((item) => {
          const isActive = sidePanelVisible && activeSidePanel === item.id;
          return (
            <Tooltip
              key={item.id}
              content={`${item.label} ${item.shortcut}`}
              side="right"
            >
              <button
                type="button"
                onClick={() => toggleSidePanel(item.id)}
                className={`relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? "bg-zinc-800/50 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                aria-label={item.label}
                aria-pressed={isActive}
              >
                {isActive && (
                  <span className="absolute left-0 h-5 w-0.5 rounded-r bg-indigo-500" />
                )}
                <item.icon size={18} />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex flex-col items-center">
        <Tooltip content="Toggle Terminal ⌘J" side="right">
          <button
            type="button"
            onClick={toggleBottomPanel}
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-colors ${
              bottomPanelVisible
                ? "text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
            aria-label="Toggle Terminal"
            aria-pressed={bottomPanelVisible}
          >
            <Terminal size={18} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
