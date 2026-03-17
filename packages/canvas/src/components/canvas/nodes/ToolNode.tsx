import type { Node, NodeProps } from "@xyflow/react";
import { Wrench } from "lucide-react";
import { memo } from "react";
import { BaseNodeShell } from "./BaseNodeShell";

interface ToolNodeData {
  label: string;
  config: {
    tool_name: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type ToolNodeProps = NodeProps<Node<ToolNodeData>>;

function ToolNodeComponent({ data, selected }: ToolNodeProps) {
  return (
    <BaseNodeShell
      label={data.label}
      icon={Wrench}
      accentClass="gw-node-tool"
      iconColor="text-amber-400"
      selected={!!selected}
    >
      {data.config.tool_name && (
        <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase">
            {data.config.tool_name}
          </span>
        </div>
      )}
    </BaseNodeShell>
  );
}

export const ToolNode = memo(ToolNodeComponent);
