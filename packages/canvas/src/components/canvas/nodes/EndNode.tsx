import type { Node, NodeProps } from "@xyflow/react";
import { Square } from "lucide-react";
import { memo } from "react";
import { BaseNodeShell } from "./BaseNodeShell";

type EndNodeProps = NodeProps<Node<{ label: string }>>;

function EndNodeComponent({ data, selected }: EndNodeProps) {
  return (
    <BaseNodeShell
      label={data.label}
      icon={Square}
      accentClass="gw-node-end"
      iconColor="text-red-400"
      selected={!!selected}
      sourceHandle={false}
    />
  );
}

export const EndNode = memo(EndNodeComponent);
