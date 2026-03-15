import { useGraphStore } from "@store/graphSlice";
import { useUIStore } from "@store/uiSlice";
import { Button } from "@ui/Button";
import { Dialog } from "@ui/Dialog";
import { Input } from "@ui/Input";
import { memo, useCallback, useState } from "react";

// Container component — accesses stores directly for dialog state and graph creation
function NewGraphDialogComponent() {
  const open = useUIStore((s) => s.newGraphDialogOpen);
  const setOpen = useUIStore((s) => s.setNewGraphDialogOpen);
  const setView = useUIStore((s) => s.setView);
  const newGraph = useGraphStore((s) => s.newGraph);
  const [name, setName] = useState("");

  const handleClose = useCallback(() => {
    setOpen(false);
    setName("");
  }, [setOpen]);

  const handleCreate = useCallback(() => {
    const graphName = name.trim() || "Untitled Graph";
    newGraph(graphName);
    setOpen(false);
    setView("canvas");
    setName("");
  }, [name, newGraph, setOpen, setView]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleCreate();
    },
    [handleCreate],
  );

  return (
    <Dialog open={open} onClose={handleClose} title="New Graph">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="graph-name"
            className="mb-1 block text-xs font-medium text-zinc-400"
          >
            Name
          </label>
          <Input
            id="graph-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="My Graph"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreate}>
            Create Graph
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export const NewGraphDialog = memo(NewGraphDialogComponent);
