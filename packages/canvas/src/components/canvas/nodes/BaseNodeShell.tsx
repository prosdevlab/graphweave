import { Handle, Position } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, memo } from "react";

interface BaseNodeShellProps {
  label: string;
  icon: LucideIcon;
  accentClass: string;
  iconColor: string;
  selected: boolean;
  sourceHandle?: boolean;
  targetHandle?: boolean;
  children?: ReactNode;
}

function BaseNodeShellComponent({
  label,
  icon: Icon,
  accentClass,
  iconColor,
  selected,
  sourceHandle = true,
  targetHandle = true,
  children,
}: BaseNodeShellProps) {
  return (
    <div
      className={`gw-node ${accentClass} ${selected ? "gw-node-selected" : ""}`}
    >
      {targetHandle && (
        <Handle type="target" position={Position.Left} className="gw-handle" />
      )}
      <div className="flex items-center gap-2">
        <Icon size={14} className={`shrink-0 ${iconColor}`} />
        <span className="truncate font-medium">{label}</span>
      </div>
      {children}
      {sourceHandle && (
        <Handle type="source" position={Position.Right} className="gw-handle" />
      )}
    </div>
  );
}

export const BaseNodeShell = memo(BaseNodeShellComponent);
