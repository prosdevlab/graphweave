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
      typeLabel="END"
      accentClass="gw-node-end"
      selected={!!selected}
      sourceHandle={false}
    />
  );
}

export const EndNode = memo(EndNodeComponent);
