import type { StateField } from "@shared/schema";
import { DEFAULT_FIELD_KEYS } from "@store/graphSlice";
import { X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { FieldUsage } from "./StatePanel";

const FIELD_DESCRIPTIONS: Record<string, string> = {
  messages: "Conversation history \u2014 LLM nodes read and write here",
  user_input: "Provided by the user when running the graph",
  llm_response: "Latest LLM output text",
};

interface StateFieldRowProps {
  field: StateField;
  usage: FieldUsage;
  onDelete: () => void;
  onNodeClick: (nodeId: string) => void;
}

const REDUCER_LABELS: Record<string, string> = {
  replace: "replace",
  append: "append",
  merge: "merge",
};

/** Build a display name, disambiguating duplicate labels with nodeDetail. */
function formatWriterNames(
  writers: FieldUsage["writers"],
): { nodeId: string; display: string }[] {
  const labelCounts = new Map<string, number>();
  for (const w of writers) {
    labelCounts.set(w.nodeLabel, (labelCounts.get(w.nodeLabel) ?? 0) + 1);
  }
  return writers.map((w) => ({
    nodeId: w.nodeId,
    display:
      (labelCounts.get(w.nodeLabel) ?? 0) > 1 && w.nodeDetail
        ? `${w.nodeLabel} (${w.nodeDetail})`
        : w.nodeLabel,
  }));
}

function formatReaderNames(
  readers: FieldUsage["readers"],
): { nodeId: string; display: string }[] {
  const labelCounts = new Map<string, number>();
  for (const r of readers) {
    labelCounts.set(r.nodeLabel, (labelCounts.get(r.nodeLabel) ?? 0) + 1);
  }
  return readers.map((r) => {
    const isDuplicate = (labelCounts.get(r.nodeLabel) ?? 0) > 1;
    if (isDuplicate && r.nodeDetail) {
      return {
        nodeId: r.nodeId,
        display: `${r.nodeLabel} (${r.nodeDetail}, ${r.paramName})`,
      };
    }
    return {
      nodeId: r.nodeId,
      display: `${r.nodeLabel} (${r.paramName})`,
    };
  });
}

export function StateFieldRow({
  field,
  usage,
  onDelete,
  onNodeClick,
}: StateFieldRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isReadonly = field.readonly === true;
  const hasUsage = usage.readers.length > 0 || usage.writers.length > 0;

  const writerNames = useMemo(
    () => formatWriterNames(usage.writers),
    [usage.writers],
  );
  const readerNames = useMemo(
    () => formatReaderNames(usage.readers),
    [usage.readers],
  );

  const handleDeleteClick = () => {
    if (hasUsage && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete();
    setConfirmDelete(false);
  };

  return (
    <div className="rounded border border-zinc-800 p-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-medium text-zinc-200">{field.key}</span>
          {DEFAULT_FIELD_KEYS.has(field.key) &&
            FIELD_DESCRIPTIONS[field.key] && (
              <p className="text-[9px] text-zinc-500">
                {FIELD_DESCRIPTIONS[field.key]}
              </p>
            )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-600">{field.type}</span>
          <span className="text-[10px] text-zinc-700">/</span>
          <span className="text-[10px] text-zinc-600">
            {REDUCER_LABELS[field.reducer] ?? field.reducer}
          </span>
          {isReadonly && (
            <span className="rounded bg-zinc-800 px-1 text-[9px] text-zinc-500">
              RO
            </span>
          )}
          {!isReadonly && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className="flex cursor-pointer items-center justify-center rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
              aria-label={`Delete ${field.key}`}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Usage lines — grouped arrows */}
      {(usage.writers.length > 0 || usage.readers.length > 0) && (
        <div className="mt-1 space-y-0.5">
          {writerNames.length > 0 && (
            <div className="text-[10px] text-zinc-500">
              <span className="text-zinc-600">{"\u2190 "}</span>
              {writerNames.map((w, i) => (
                <Fragment key={`w-${w.nodeId}`}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => onNodeClick(w.nodeId)}
                    className="cursor-pointer hover:text-zinc-300"
                  >
                    {w.display}
                  </button>
                </Fragment>
              ))}
            </div>
          )}
          {readerNames.length > 0 && (
            <div className="text-[10px] text-zinc-500">
              <span className="text-zinc-600">{"\u2192 "}</span>
              {readerNames.map((r, i) => (
                <Fragment key={`r-${r.nodeId}-${r.display}`}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => onNodeClick(r.nodeId)}
                    className="cursor-pointer hover:text-zinc-300"
                  >
                    {r.display}
                  </button>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-1.5 rounded bg-zinc-800/50 p-1.5">
          <p className="text-[10px] text-amber-400">
            This field is referenced by nodes. Removing it will break their
            mappings.
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
              className="text-[10px] font-medium text-red-400 hover:text-red-300"
            >
              Remove anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] text-zinc-400 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
