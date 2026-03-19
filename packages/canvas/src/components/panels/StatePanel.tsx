import { useCanvasContext } from "@contexts/CanvasContext";
import type { NodeSchema, StateField } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { Sheet } from "@ui/Sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractRootKey } from "../canvas/runInputUtils";
import { AddFieldForm } from "./AddFieldForm";
import { StateFieldRow } from "./StateFieldRow";

export interface FieldUsage {
  readers: {
    nodeId: string;
    nodeLabel: string;
    nodeDetail: string;
    paramName: string;
  }[];
  writers: { nodeId: string; nodeLabel: string; nodeDetail: string }[];
}

function computeFieldUsage(fieldKey: string, nodes: NodeSchema[]): FieldUsage {
  const readers: FieldUsage["readers"] = [];
  const writers: FieldUsage["writers"] = [];
  const seenWriterIds = new Set<string>();

  for (const node of nodes) {
    if (node.type !== "llm" && node.type !== "tool") continue;

    const nodeDetail =
      node.type === "llm" ? node.config.model : node.config.tool_name;

    const isWriter =
      node.config.output_key === fieldKey ||
      // LLM dual-write: execution layer appends to messages even when
      // output_key is a dedicated field (e.g. "llm_response").
      (node.type === "llm" &&
        fieldKey === "messages" &&
        node.config.output_key !== "messages");

    if (isWriter && !seenWriterIds.has(node.id)) {
      seenWriterIds.add(node.id);
      writers.push({ nodeId: node.id, nodeLabel: node.label, nodeDetail });
    }

    for (const [param, expr] of Object.entries(node.config.input_map)) {
      if (expr && extractRootKey(expr) === fieldKey) {
        readers.push({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeDetail,
          paramName: param,
        });
      }
    }
  }
  return { readers, writers };
}

export function StatePanel() {
  const { statePanelOpen, setStatePanelOpen, setSelectedNodeId } =
    useCanvasContext();
  const stateFields = useGraphStore((s) => s.graph?.state ?? []);
  const nodes = useGraphStore((s) => s.nodes);
  const addStateFields = useGraphStore((s) => s.addStateFields);
  const removeStateFields = useGraphStore((s) => s.removeStateFields);

  const [deletedField, setDeletedField] = useState<StateField | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute usage for all fields at once (memoized)
  const usageMap = useMemo(() => {
    const map = new Map<string, FieldUsage>();
    for (const field of stateFields) {
      map.set(field.key, computeFieldUsage(field.key, nodes));
    }
    return map;
  }, [nodes, stateFields]);

  const existingKeys = useMemo(
    () => new Set(stateFields.map((f) => f.key)),
    [stateFields],
  );

  // Clear undo timer on unmount to avoid setting state on unmounted component
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleDelete = useCallback(
    (field: StateField) => {
      removeStateFields([field.key]);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setDeletedField(field);
      undoTimerRef.current = setTimeout(() => {
        setDeletedField(null);
        undoTimerRef.current = null;
      }, 5000);
    },
    [removeStateFields],
  );

  const handleUndo = useCallback(() => {
    if (deletedField) {
      addStateFields([deletedField]);
      setDeletedField(null);
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    }
  }, [deletedField, addStateFields]);

  const handleAdd = useCallback(
    (field: StateField) => {
      addStateFields([field]);
    },
    [addStateFields],
  );

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId],
  );

  return (
    <>
      <Sheet
        open={statePanelOpen}
        onClose={() => setStatePanelOpen(false)}
        title="State Fields"
        side="left"
      >
        <p className="mb-3 text-[10px] text-zinc-500">
          State fields carry data between nodes. Each field is available as an
          input source when configuring Tool and LLM nodes.
          {stateFields.length > 0 && (
            <>
              <br />
              Click a node name to jump to its config.
            </>
          )}
        </p>

        {stateFields.length === 0 ? (
          <p className="mb-3 text-xs text-zinc-500">
            No state fields yet. Add one below.
          </p>
        ) : (
          <div className="space-y-2">
            {stateFields.map((field) => (
              <StateFieldRow
                key={field.key}
                field={field}
                usage={usageMap.get(field.key) ?? { readers: [], writers: [] }}
                onDelete={() => handleDelete(field)}
                onNodeClick={handleNodeClick}
              />
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-zinc-800 pt-3">
          <p className="mb-1 text-xs font-medium text-zinc-300">Add a field</p>
          <p className="mb-2 text-[10px] text-zinc-500">
            Default fields and tool parameters are added automatically. Add a
            custom field here for data not tied to a specific tool.
          </p>
          <AddFieldForm existingKeys={existingKeys} onAdd={handleAdd} />
        </div>
      </Sheet>

      {/* Undo toast */}
      {deletedField && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 shadow-lg">
          <span className="text-xs text-zinc-300">
            Removed field &ldquo;{deletedField.key}&rdquo;
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
