import type { GraphSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import { Button } from "@ui/Button";
import { Brain, Play, Plus, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GraphCard } from "./GraphCard";
import { NewGraphDialog } from "./NewGraphDialog";

export function HomeView() {
  const [graphs, setGraphs] = useState<GraphSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const loadGraphList = useGraphStore((s) => s.loadGraphList);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const setView = useUIStore((s) => s.setView);
  const setNewGraphDialogOpen = useUIStore((s) => s.setNewGraphDialogOpen);

  useEffect(() => {
    loadGraphList()
      .then(setGraphs)
      .catch(() => setGraphs([]))
      .finally(() => setLoading(false));
  }, [loadGraphList]);

  const handleSelectGraph = useCallback(
    async (id: string) => {
      await loadGraph(id);
      setView("canvas");
    },
    [loadGraph, setView],
  );

  const handleNewGraph = useCallback(() => {
    setNewGraphDialogOpen(true);
  }, [setNewGraphDialogOpen]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-6">
        <h1 className="text-sm font-semibold">GraphWeave</h1>
        <Button variant="primary" onClick={handleNewGraph}>
          <Plus size={14} className="mr-1" /> New Graph
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-zinc-500">Loading...</span>
          </div>
        ) : graphs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-emerald-500 bg-zinc-900">
                <Play size={16} className="text-emerald-400" />
              </div>
              <div className="h-px w-8 bg-zinc-700" />
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-blue-500 bg-zinc-900">
                <Brain size={16} className="text-blue-400" />
              </div>
              <div className="h-px w-8 bg-zinc-700" />
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-red-500 bg-zinc-900">
                <Square size={16} className="text-red-400" />
              </div>
            </div>
            <h2 className="mb-2 text-lg font-medium">No graphs yet</h2>
            <p className="mb-6 text-sm text-zinc-400">
              Create your first AI workflow
            </p>
            <Button variant="primary" onClick={handleNewGraph}>
              <Plus size={14} className="mr-1" /> New Graph
            </Button>
          </div>
        ) : (
          <div>
            <h2 className="mb-4 text-sm font-medium text-zinc-400">
              Your Graphs
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {graphs.map((g) => (
                <GraphCard
                  key={g.id}
                  name={g.name}
                  nodeCount={g.nodes.length}
                  updatedAt={g.metadata.updated_at}
                  onClick={() => handleSelectGraph(g.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <NewGraphDialog />
    </div>
  );
}
