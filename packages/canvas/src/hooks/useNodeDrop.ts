import type { NodeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import type { ReactFlowInstance } from "@xyflow/react";
import { type DragEvent, useCallback } from "react";

/** Default configs for each C1 node type */
const NODE_DEFAULTS: Record<string, () => Partial<NodeSchema>> = {
  start: () => ({
    type: "start" as const,
    label: "Start",
    config: {},
  }),
  llm: () => ({
    type: "llm" as const,
    label: "LLM",
    config: {
      provider: "openai",
      model: "gpt-4o",
      system_prompt: "",
      temperature: 0.7,
      max_tokens: 1024,
      input_map: {},
      output_key: "result",
    },
  }),
  end: () => ({
    type: "end" as const,
    label: "End",
    config: {},
  }),
};

export function useNodeDrop(reactFlowInstance: ReactFlowInstance | null) {
  const addNode = useGraphStore((s) => s.addNode);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (!reactFlowInstance) return;

      const nodeType = event.dataTransfer.getData(
        "application/graphweave-node-type",
      );
      if (!nodeType || !NODE_DEFAULTS[nodeType]) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const defaults = NODE_DEFAULTS[nodeType]();
      const node: NodeSchema = {
        id: crypto.randomUUID(),
        position,
        ...defaults,
      } as NodeSchema;

      addNode(node);
    },
    [reactFlowInstance, addNode],
  );

  return { onDragOver, onDrop };
}
