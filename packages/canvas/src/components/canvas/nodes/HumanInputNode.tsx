import type { Node, NodeProps } from "@xyflow/react";
import { UserCircle } from "lucide-react";
import { memo } from "react";
import { BaseNodeShell } from "./BaseNodeShell";

interface HumanInputNodeData {
  label: string;
  config: {
    prompt: string;
    input_key: string;
    timeout_ms?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type HumanInputNodeProps = NodeProps<Node<HumanInputNodeData>>;

function HumanInputNodeComponent({ data, selected }: HumanInputNodeProps) {
  const prompt = data.config.prompt ?? "";

  return (
    <BaseNodeShell
      label={data.label}
      icon={UserCircle}
      accentClass="gw-node-human_input"
      iconColor="text-cyan-400"
      selected={!!selected}
    >
      {prompt && (
        <div className="mt-1 max-w-[140px] truncate text-[10px] text-zinc-400">
          {prompt}
        </div>
      )}
    </BaseNodeShell>
  );
}

export const HumanInputNode = memo(HumanInputNodeComponent);
