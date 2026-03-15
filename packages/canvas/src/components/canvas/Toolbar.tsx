import { Card, CardContent } from "@ui/Card";
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
  description: string;
  icon: LucideIcon;
  accentBorder: string;
  iconColor: string;
}

const TOOLBAR_ITEMS: ToolbarItem[] = [
  {
    type: "start",
    label: "Start",
    description: "Entry point of the graph",
    icon: Play,
    accentBorder: "border-l-emerald-500",
    iconColor: "text-emerald-400",
  },
  {
    type: "llm",
    label: "LLM",
    description: "Call an AI model with a prompt",
    icon: Brain,
    accentBorder: "border-l-indigo-500",
    iconColor: "text-indigo-400",
  },
  {
    type: "end",
    label: "End",
    description: "Exit point of the graph",
    icon: Square,
    accentBorder: "border-l-red-500",
    iconColor: "text-red-400",
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
        {!collapsed && (
          <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Nodes
          </h3>
        )}
        <div className="flex flex-col gap-2">
          {TOOLBAR_ITEMS.map((item) =>
            collapsed ? (
              <Tooltip key={item.type} content={item.label} side="right">
                <Card
                  interactive
                  draggable
                  onDragStart={(e: DragEvent) => onDragStart(e, item.type)}
                  className={`cursor-grab border-l-2 ${item.accentBorder} active:cursor-grabbing`}
                >
                  <CardContent className="flex items-center justify-center px-0 py-2">
                    <item.icon size={16} className={item.iconColor} />
                  </CardContent>
                </Card>
              </Tooltip>
            ) : (
              <Card
                key={item.type}
                interactive
                draggable
                onDragStart={(e: DragEvent) => onDragStart(e, item.type)}
                className={`cursor-grab border-l-2 ${item.accentBorder} active:cursor-grabbing`}
              >
                <CardContent className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <item.icon
                      size={14}
                      className={`shrink-0 ${item.iconColor}`}
                    />
                    <span className="text-xs font-medium text-zinc-200">
                      {item.label}
                    </span>
                  </div>
                  <p className="mt-1 pl-[22px] text-[11px] leading-tight text-zinc-500">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      </SidebarContent>
      <SidebarFooter>
        <SidebarTrigger />
      </SidebarFooter>
    </Sidebar>
  );
}

export const Toolbar = memo(ToolbarComponent);
