import type { Node, NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { memo } from "react";
import { BaseNodeShell } from "./BaseNodeShell";

interface ConditionNodeData {
  label: string;
  config: {
    condition: {
      type: string;
      [key: string]: unknown;
    };
    branches: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

type ConditionNodeProps = NodeProps<Node<ConditionNodeData>>;

function ConditionNodeComponent({ data, selected }: ConditionNodeProps) {
  const conditionType = data.config.condition?.type ?? "";
  const branchCount = Object.keys(data.config.branches ?? {}).length;

  return (
    <BaseNodeShell
      label={data.label}
      icon={GitBranch}
      accentClass="gw-node-condition"
      iconColor="text-violet-400"
      selected={!!selected}
    >
      {conditionType && (
        <div className="mt-1 flex items-center gap-1.5 text-zinc-400">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase">
            {conditionType.replace(/_/g, " ")}
          </span>
          {branchCount > 0 && (
            <span className="text-[10px]">
              {branchCount} {branchCount === 1 ? "branch" : "branches"}
            </span>
          )}
        </div>
      )}
    </BaseNodeShell>
  );
}

export const ConditionNode = memo(ConditionNodeComponent);
