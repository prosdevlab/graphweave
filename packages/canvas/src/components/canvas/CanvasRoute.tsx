import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasProvider } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";
import { NodeConfigPanel } from "../panels/NodeConfigPanel";
import { RunPanel } from "../panels/RunPanel";
import { StatePanel } from "../panels/StatePanel";
import { CanvasHeader } from "./CanvasHeader";
import { GraphCanvas } from "./GraphCanvas";

export function CanvasRoute() {
  const { id } = useParams<{ id: string }>();
  const graph = useGraphStore((s) => s.graph);
  const saveError = useGraphStore((s) => s.saveError);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const [loading, setLoading] = useState(true);

  useBeforeUnload();

  useEffect(() => {
    if (!id) return;
    if (graph?.id === id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadGraph(id).finally(() => setLoading(false));
  }, [id, graph?.id, loadGraph]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <span className="text-sm text-zinc-500">Loading graph...</span>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
        <p className="mb-4 text-sm text-zinc-400">
          {saveError || "Graph not found"}
        </p>
        <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasProvider>
        <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
          <CanvasHeader />
          <main className="relative h-[calc(100vh-3rem)]">
            <GraphCanvas />
            <StatePanel />
            <NodeConfigPanel />
            <RunPanel />
          </main>
        </div>
      </CanvasProvider>
    </ReactFlowProvider>
  );
}
