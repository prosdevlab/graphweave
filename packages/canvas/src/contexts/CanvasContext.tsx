import { type ReactFlowInstance, useReactFlow } from "@xyflow/react";
import { type ReactNode, createContext, useContext, useState } from "react";

interface CanvasContextValue {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  reactFlowInstance: ReactFlowInstance | null;
  stampNodeType: string | null;
  setStampNodeType: (type: string | null) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [stampNodeType, setStampNodeType] = useState<string | null>(null);
  const reactFlowInstance = useReactFlow();

  return (
    <CanvasContext
      value={{
        selectedNodeId,
        setSelectedNodeId,
        reactFlowInstance,
        stampNodeType,
        setStampNodeType,
      }}
    >
      {children}
    </CanvasContext>
  );
}

export function useCanvasContext(): CanvasContextValue {
  const ctx = useContext(CanvasContext);
  if (!ctx) {
    throw new Error("useCanvasContext must be used within a CanvasProvider");
  }
  return ctx;
}
