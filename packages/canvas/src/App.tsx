import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export default function App() {
  return (
    <ReactFlowProvider>
      <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
        <header className="flex h-12 items-center border-b border-zinc-800 px-4">
          <h1 className="text-sm font-semibold">GraphWeave</h1>
        </header>
        <main className="h-[calc(100vh-3rem)]">
          <div className="flex h-full items-center justify-center text-zinc-500">
            Drag nodes to start
          </div>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
