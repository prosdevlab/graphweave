import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@ui/Sidebar";
import { Tooltip } from "@ui/Tooltip";
import type { LucideIcon } from "lucide-react";
import { Brain, Play, Square } from "lucide-react";
import { type DragEvent, memo, useCallback } from "react";

interface ToolbarItem {
  type: string;
  label: string;
  icon: LucideIcon;
  accentClass: string;
  tooltip: string;
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    type: "start",
    label: "Start",
    icon: Play,
    accentClass: "border-emerald-500",
    tooltip: "Entry point — drag to add",
  },
  {
    type: "llm",
    label: "LLM",
    icon: Brain,
    accentClass: "border-blue-500",
    tooltip: "AI model call — drag to add",
  },
  {
    type: "end",
    label: "End",
    icon: Square,
    accentClass: "border-red-500",
    tooltip: "Exit point — drag to add",
  },
];

function ToolbarComponent() {
  const { collapsed } = useSidebar();

  const onDragStart = useCallback((event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/graphweave-node-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  }, []);

  return (
    <Sidebar>
      <SidebarContent>
        <div className="flex flex-col gap-1">
          {TOOLBAR_ITEMS.map((item) => (
            <Tooltip key={item.type} content={item.tooltip} side="right">
              <div
                draggable
                onDragStart={(e) => onDragStart(e, item.type)}
                className={`flex cursor-grab items-center gap-2 rounded-md border-l-2 ${item.accentClass} px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 active:cursor-grabbing`}
              >
                <item.icon size={14} className="shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </div>
            </Tooltip>
          ))}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
  );
}

export const Toolbar = memo(ToolbarComponent);
