import { useGraphStore } from "@store/graphSlice";
import { useRunStore } from "@store/runSlice";
import { useUIStore } from "@store/uiSlice";
import { Button } from "@ui/Button";
import { ChevronLeft, Pencil, Play, Save, Square } from "lucide-react";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { validateGraph } from "../../utils/validateGraph";
import { RunInputDialog } from "./RunInputDialog";
import { getConsumedInputFields } from "./runInputUtils";

function CanvasHeaderComponent() {
  const graph = useGraphStore((s) => s.graph);
  const dirty = useGraphStore((s) => s.dirty);
  const saving = useGraphStore((s) => s.saving);
  const saveError = useGraphStore((s) => s.saveError);
  const saveGraph = useGraphStore((s) => s.saveGraph);
  const renameGraph = useGraphStore((s) => s.renameGraph);
  const runStatus = useRunStore((s) => s.runStatus);
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [inputDialogOpen, setInputDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show toast when saveError appears
  useEffect(() => {
    if (saveError) {
      useUIStore.getState().showToast(saveError, "error");
    }
  }, [saveError]);

  const handleBack = useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Leave anyway?")) {
      return;
    }
    navigate("/");
  }, [dirty, navigate]);

  const handleNameClick = useCallback(() => {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleNameBlur = useCallback(() => {
    setEditing(false);
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      renameGraph(e.target.value);
    },
    [renameGraph],
  );

  const handleNameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Escape") {
        setEditing(false);
        inputRef.current?.blur();
      }
    },
    [],
  );

  const handleSave = useCallback(() => {
    saveGraph();
  }, [saveGraph]);

  const handleRun = useCallback(async () => {
    const { nodes, edges, dirty: isDirty } = useGraphStore.getState();

    const errors = validateGraph(nodes, edges);
    if (errors.length > 0) {
      useUIStore
        .getState()
        .showToast(errors[0]?.message ?? "Validation failed", "error");
      return;
    }

    if (isDirty) {
      await useGraphStore.getState().saveGraph();
      if (useGraphStore.getState().saveError) {
        useUIStore
          .getState()
          .showToast(
            "Failed to save — fix save errors before running",
            "error",
          );
        return;
      }
    }

    const graph = useGraphStore.getState().graph;
    const { consumedFields } = getConsumedInputFields(
      graph?.state ?? [],
      graph?.nodes ?? [],
    );

    if (consumedFields.length === 0) {
      // No user input needed — run immediately
      if (graph) {
        useRunStore.getState().startRun(graph.id, {});
      }
    } else {
      setInputDialogOpen(true);
    }
  }, []);

  const handleRunSubmit = useCallback(
    (input: Record<string, unknown>) => {
      setInputDialogOpen(false);
      if (graph) {
        useRunStore.getState().startRun(graph.id, input);
      }
    },
    [graph],
  );

  const handleStop = useCallback(() => {
    useRunStore.getState().cancelRun();
  }, []);

  const isRunning = runStatus === "running" || runStatus === "reconnecting";

  return (
    <>
      <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex cursor-pointer items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"
            aria-label="Back to home"
            type="button"
          >
            <ChevronLeft size={16} />
            <span>GraphWeave</span>
          </button>

          {graph && (
            <div className="flex items-center gap-1 border-l border-zinc-700 pl-3">
              {editing ? (
                <input
                  ref={inputRef}
                  value={graph.name}
                  onChange={handleNameChange}
                  onBlur={handleNameBlur}
                  onKeyDown={handleNameKeyDown}
                  className="w-40 border-b border-indigo-500 bg-transparent text-sm text-zinc-100 outline-none"
                  aria-label="Graph name"
                />
              ) : (
                <button
                  onClick={handleNameClick}
                  className="group flex cursor-pointer items-center gap-1 text-sm text-zinc-300 hover:text-zinc-100"
                  title="Click to rename"
                  type="button"
                >
                  <span>{graph.name}</span>
                  <Pencil
                    size={12}
                    className="text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </button>
              )}
              {dirty && (
                <span className="text-amber-400" title="Unsaved changes">
                  *
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!graph || !dirty || saving}
          >
            <Save size={14} className="mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>

          {isRunning ? (
            <Button variant="ghost" onClick={handleStop}>
              <Square size={14} className="mr-1 text-red-400" />
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleRun}
              disabled={!graph || saving}
            >
              <Play size={14} className="mr-1" />
              Run
            </Button>
          )}
        </div>
      </header>

      <RunInputDialog
        open={inputDialogOpen}
        onClose={() => setInputDialogOpen(false)}
        onSubmit={handleRunSubmit}
      />
    </>
  );
}

export const CanvasHeader = memo(CanvasHeaderComponent);
