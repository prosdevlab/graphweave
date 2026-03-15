import type { Node, NodeProps } from "@xyflow/react";
import { Brain } from "lucide-react";
import { memo } from "react";
import { BaseNodeShell } from "./BaseNodeShell";

interface LLMNodeData {
  label: string;
  config: {
    provider: string;
    model: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type LLMNodeProps = NodeProps<Node<LLMNodeData>>;

function LLMNodeComponent({ data, selected }: LLMNodeProps) {
  return (
    <BaseNodeShell
      label={data.label}
      icon={Brain}
      accentClass="gw-node-llm"
      iconColor="text-indigo-400"
      selected={!!selected}
    >
      <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase">
          {data.config.provider}
        </span>
        <span className="truncate text-[10px]">{data.config.model}</span>
      </div>
    </BaseNodeShell>
  );
}

export const LLMNode = memo(LLMNodeComponent);
