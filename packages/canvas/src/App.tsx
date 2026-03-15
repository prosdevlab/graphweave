import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasProvider } from "@contexts/CanvasContext";
import { GraphCanvas } from "./components/canvas/GraphCanvas";
import { NodeConfigPanel } from "./components/panels/NodeConfigPanel";

export default function App() {
  return (
    <ReactFlowProvider>
      <CanvasProvider>
        <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
          <header className="flex h-12 items-center border-b border-zinc-800 px-4">
            <h1 className="text-sm font-semibold">GraphWeave</h1>
          </header>
          <main className="relative h-[calc(100vh-3rem)]">
            <GraphCanvas />
            <NodeConfigPanel />
          </main>
        </div>
      </CanvasProvider>
    </ReactFlowProvider>
  );
}
