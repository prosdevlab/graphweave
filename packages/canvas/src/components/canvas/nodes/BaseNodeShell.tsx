import { Handle, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, memo } from "react";

interface BaseNodeShellProps {
  label: string;
  icon: LucideIcon;
  typeLabel: string;
  accentClass: string;
  selected: boolean;
  sourceHandle?: boolean;
  targetHandle?: boolean;
  children?: ReactNode;
}

function BaseNodeShellComponent({
  label,
  icon: Icon,
  typeLabel,
  accentClass,
  selected,
  sourceHandle = true,
  targetHandle = true,
  children,
}: BaseNodeShellProps) {
  return (
    <div
      className={`gw-node ${accentClass} ${selected ? "gw-node-selected" : ""}`}
    >
      {targetHandle && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="shrink-0 text-zinc-400" />
        <span className="text-[10px] uppercase text-zinc-500">{typeLabel}</span>
        <span className="truncate font-medium">{label}</span>
      </div>
      {children}
      {sourceHandle && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

export const BaseNodeShell = memo(BaseNodeShellComponent);
