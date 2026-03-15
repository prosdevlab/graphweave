import type { Node, NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import { memo } from "react";
import { BaseNodeShell } from "./BaseNodeShell";

type StartNodeProps = NodeProps<Node<{ label: string }>>;

function StartNodeComponent({ data, selected }: StartNodeProps) {
  return (
    <BaseNodeShell
      label={data.label}
      icon={Play}
      accentClass="gw-node-start"
      iconColor="text-emerald-400"
      selected={!!selected}
      targetHandle={false}
    />
  );
}

export const StartNode = memo(StartNodeComponent);
