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
import {
  ValidationErrorDialog,
  type ValidationItem,
  fromClientErrors,
  fromServerErrors,
} from "../dialogs/ValidationErrorDialog";
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
  const [validationItems, setValidationItems] = useState<ValidationItem[]>([]);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
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

  /** Proceed to either show input dialog or start run directly */
  const proceedToRun = useCallback(() => {
    const g = useGraphStore.getState().graph;
    const { consumedFields } = getConsumedInputFields(
      g?.state ?? [],
      g?.nodes ?? [],
    );
    if (consumedFields.length === 0) {
      if (g) useRunStore.getState().startRun(g.id, {});
    } else {
      setInputDialogOpen(true);
    }
  }, []);

  const handleRun = useCallback(async () => {
    const { nodes, edges, dirty: isDirty } = useGraphStore.getState();

    // 1. Client-side validation (instant)
    const clientErrors = validateGraph(nodes, edges);
    if (clientErrors.length > 0) {
      setValidationItems(fromClientErrors(clientErrors));
      setValidationDialogOpen(true);
      return;
    }

    // 2. Save if dirty
    if (isDirty) {
      useUIStore.getState().showToast("Saving...", "info");
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

    // 3. Server-side validation
    const g = useGraphStore.getState().graph;
    if (!g) return;

    try {
      useUIStore.getState().showToast("Validating...", "info");
      const result = await useGraphStore.getState().validateServer();
      useUIStore.getState().dismissToast();

      if (!result.valid && result.errors.length > 0) {
        setValidationItems(fromServerErrors(result.errors));
        setValidationDialogOpen(true);
        return;
      }
    } catch {
      // Server validation unavailable — warn user but proceed (client check passed)
      useUIStore
        .getState()
        .showToast(
          "Server validation unavailable — proceeding with client checks only",
          "info",
        );
    }

    // 4. Proceed to run
    proceedToRun();
  }, [proceedToRun]);

  const handleRunAnyway = useCallback(() => {
    setValidationDialogOpen(false);
    proceedToRun();
  }, [proceedToRun]);

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

      <ValidationErrorDialog
        open={validationDialogOpen}
        onClose={() => setValidationDialogOpen(false)}
        items={validationItems}
        onRunAnyway={handleRunAnyway}
      />
    </>
  );
}

export const CanvasHeader = memo(CanvasHeaderComponent);
