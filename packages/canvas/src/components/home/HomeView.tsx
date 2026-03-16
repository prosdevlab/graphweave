import type { GraphSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import { Button } from "@ui/Button";
import { Dialog } from "@ui/Dialog";
import { Input } from "@ui/Input";
import { Brain, Play, Plus, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { GraphCard } from "./GraphCard";
import { NewGraphDialog } from "./NewGraphDialog";

type DeleteTarget = { id: string; name: string };
type RenameTarget = { id: string; name: string };

export function HomeView() {
  const [graphs, setGraphs] = useState<GraphSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const loadGraphList = useGraphStore((s) => s.loadGraphList);
  const deleteGraphById = useGraphStore((s) => s.deleteGraphById);
  const renameGraphById = useGraphStore((s) => s.renameGraphById);
  const setNewGraphDialogOpen = useUIStore((s) => s.setNewGraphDialogOpen);

  useEffect(() => {
    loadGraphList()
      .then(setGraphs)
      .catch(() => setGraphs([]))
      .finally(() => setLoading(false));
  }, [loadGraphList]);

  const handleSelectGraph = useCallback(
    (id: string) => {
      navigate(`/graph/${id}`);
    },
    [navigate],
  );

  const handleNewGraph = useCallback(() => {
    setNewGraphDialogOpen(true);
  }, [setNewGraphDialogOpen]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteGraphById(deleteTarget.id);
    setGraphs((prev) => prev.filter((g) => g.id !== deleteTarget.id));
    setDeleteTarget(null);
  }, [deleteTarget, deleteGraphById]);

  const handleRenameOpen = useCallback((id: string, name: string) => {
    setRenameTarget({ id, name });
    setRenameValue(name);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) return;
    const updated = await renameGraphById(renameTarget.id, renameValue.trim());
    setGraphs((prev) =>
      prev.map((g) =>
        g.id === renameTarget.id ? { ...g, name: updated.name } : g,
      ),
    );
    setRenameTarget(null);
  }, [renameTarget, renameValue, renameGraphById]);

  // Auto-focus and select the input when the rename dialog opens
  useEffect(() => {
    if (renameTarget) {
      requestAnimationFrame(() => renameInputRef.current?.select());
    }
  }, [renameTarget]);

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
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-emerald-500 bg-zinc-900">
                <Play size={16} className="text-emerald-400" />
              </div>
              <div className="h-px w-8 bg-zinc-700" />
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-indigo-500 bg-zinc-900">
                <Brain size={16} className="text-indigo-400" />
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
                  nodeCount={g.nodes?.length ?? 0}
                  updatedAt={g.metadata?.updated_at ?? ""}
                  onClick={() => handleSelectGraph(g.id)}
                  onDelete={() => setDeleteTarget({ id: g.id, name: g.name })}
                  onRename={() => handleRenameOpen(g.id, g.name)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <NewGraphDialog />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Graph"
      >
        <p className="mb-6 text-sm text-zinc-400">
          Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
          This action is permanent and cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </div>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Rename Graph"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRenameConfirm();
          }}
        >
          <Input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="mb-6"
            placeholder="Graph name"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                !renameValue.trim() || renameValue.trim() === renameTarget?.name
              }
            >
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
