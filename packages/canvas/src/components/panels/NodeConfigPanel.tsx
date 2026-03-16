import { useCanvasContext } from "@contexts/CanvasContext";
import type { LLMNode, NodeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { Button } from "@ui/Button";
import { Sheet } from "@ui/Sheet";
import { Trash2 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { EndNodeConfig } from "./config/EndNodeConfig";
import { LLMNodeConfig } from "./config/LLMNodeConfig";
import { StartNodeConfig } from "./config/StartNodeConfig";

export function NodeConfigPanel() {
  const { selectedNodeId, setSelectedNodeId } = useCanvasContext();
  const nodes = useGraphStore((s) => s.nodes);
  const updateNodeConfig = useGraphStore((s) => s.updateNodeConfig);
  const removeNode = useGraphStore((s) => s.removeNode);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const handleChange = useCallback(
    (updates: { label?: string; config?: Record<string, unknown> }) => {
      if (selectedNodeId) {
        updateNodeConfig(selectedNodeId, updates);
      }
    },
    [selectedNodeId, updateNodeConfig],
  );

  const handleDelete = useCallback(() => {
    if (selectedNodeId) {
      removeNode(selectedNodeId);
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, removeNode, setSelectedNodeId]);

  const handleClose = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  return (
    <Sheet
      open={!!selectedNode}
      onClose={handleClose}
      title={selectedNode ? `${selectedNode.type.toUpperCase()} Node` : ""}
      side="right"
    >
      {selectedNode && (
        <>
          {renderConfigForm(selectedNode, handleChange)}

          <div className="mt-6 border-t border-zinc-800 pt-4">
            <Button
              variant="ghost"
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 size={14} className="mr-1" />
              Delete Node
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function isLLMNode(node: NodeSchema): node is LLMNode {
  return node.type === "llm";
}

function renderConfigForm(
  node: NodeSchema,
  onChange: (updates: {
    label?: string;
    config?: Record<string, unknown>;
  }) => void,
) {
  switch (node.type) {
    case "start":
      return <StartNodeConfig node={node} onChange={onChange} />;
    case "llm":
      if (!isLLMNode(node)) return null;
      return <LLMNodeConfig node={node} onChange={onChange} />;
    case "end":
      return <EndNodeConfig node={node} onChange={onChange} />;
    default:
      return (
        <p className="text-xs text-zinc-500">
          No config available for this node type.
        </p>
      );
  }
}
