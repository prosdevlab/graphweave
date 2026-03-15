import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasProvider } from "@contexts/CanvasContext";
import { useUIStore } from "@store/uiSlice";
import { CanvasHeader } from "./components/canvas/CanvasHeader";
import { GraphCanvas } from "./components/canvas/GraphCanvas";
import { HomeView } from "./components/home/HomeView";
import { NodeConfigPanel } from "./components/panels/NodeConfigPanel";
import { useBeforeUnload } from "./hooks/useBeforeUnload";

function CanvasView() {
  useBeforeUnload();

  return (
    <ReactFlowProvider>
      <CanvasProvider>
        <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
          <CanvasHeader />
          <main className="relative h-[calc(100vh-3rem)]">
            <GraphCanvas />
            <NodeConfigPanel />
          </main>
        </div>
      </CanvasProvider>
    </ReactFlowProvider>
  );
}

export default function App() {
  const currentView = useUIStore((s) => s.currentView);

  return currentView === "home" ? <HomeView /> : <CanvasView />;
}
