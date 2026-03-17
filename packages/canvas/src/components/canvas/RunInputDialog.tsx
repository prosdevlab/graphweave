import { Button } from "@ui/Button";
import { Dialog } from "@ui/Dialog";
import { useState } from "react";

interface RunInputDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}

export function RunInputDialog({
  open,
  onClose,
  onSubmit,
}: RunInputDialogProps) {
  const [value, setValue] = useState("{}");
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSubmit = () => {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setParseError("Input must be a JSON object");
        return;
      }
      setParseError(null);
      onSubmit(parsed as Record<string, unknown>);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Run Graph">
      <div className="flex flex-col gap-3">
        <label className="text-sm text-zinc-400">
          Initial input (JSON)
          <textarea
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setParseError(null);
            }}
            className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500"
            rows={4}
          />
        </label>
        {parseError && <p className="text-sm text-red-400">{parseError}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Start
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
