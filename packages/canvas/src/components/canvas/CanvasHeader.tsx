import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import { Button } from "@ui/Button";
import { ChevronLeft, Pencil, Save } from "lucide-react";
import { type KeyboardEvent, memo, useCallback, useRef, useState } from "react";

function CanvasHeaderComponent() {
  const graph = useGraphStore((s) => s.graph);
  const dirty = useGraphStore((s) => s.dirty);
  const saving = useGraphStore((s) => s.saving);
  const saveError = useGraphStore((s) => s.saveError);
  const saveGraph = useGraphStore((s) => s.saveGraph);
  const renameGraph = useGraphStore((s) => s.renameGraph);
  const setView = useUIStore((s) => s.setView);

  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleBack = useCallback(() => {
    if (dirty && !window.confirm("You have unsaved changes. Leave anyway?")) {
      return;
    }
    setView("home");
  }, [dirty, setView]);

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

  return (
    <header className="flex h-12 items-center justify-between border-b border-zinc-800 px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100"
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
                className="w-40 border-b border-blue-500 bg-transparent text-sm text-zinc-100 outline-none"
                aria-label="Graph name"
              />
            ) : (
              <button
                onClick={handleNameClick}
                className="group flex items-center gap-1 text-sm text-zinc-300 hover:text-zinc-100"
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
          onClick={saveGraph}
          disabled={!graph || !dirty || saving}
        >
          <Save size={14} className="mr-1" />
          {saving ? "Saving..." : "Save"}
        </Button>
        {saveError && (
          <span className="text-xs text-red-400" role="alert">
            {saveError}
          </span>
        )}
      </div>
    </header>
  );
}

export const CanvasHeader = memo(CanvasHeaderComponent);
