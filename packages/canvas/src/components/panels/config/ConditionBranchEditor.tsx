import type { EdgeSchema, NodeSchema } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { Input } from "@ui/Input";
import { memo, useCallback, useMemo } from "react";

interface ConditionBranchEditorProps {
  nodeId: string;
  nodes: NodeSchema[];
  edges: EdgeSchema[];
}

function ConditionBranchEditorComponent({
  nodeId,
  nodes,
  edges,
}: ConditionBranchEditorProps) {
  const updateEdge = useGraphStore((s) => s.updateEdge);

  const outgoingEdges = useMemo(
    () => edges.filter((e) => e.source === nodeId),
    [edges, nodeId],
  );

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Track duplicate detection
  const branchNames = outgoingEdges.map((e) => e.condition_branch ?? "");
  const duplicates = new Set<string>(
    branchNames.filter((name, i) => name && branchNames.indexOf(name) !== i),
  );

  const handleBranchChange = useCallback(
    (edgeId: string, newBranch: string) => {
      updateEdge(edgeId, { condition_branch: newBranch });
    },
    [updateEdge],
  );

  if (outgoingEdges.length === 0) {
    return (
      <p className="text-xs text-zinc-500">Connect edges to define branches.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {outgoingEdges.map((edge) => {
        const targetNode = nodeMap.get(edge.target);
        const targetLabel = targetNode?.label ?? edge.target;
        const branchValue = edge.condition_branch ?? "";
        const isDuplicate = duplicates.has(branchValue) && branchValue !== "";

        return (
          <div key={edge.id} className="flex items-center gap-2">
            <Input
              value={branchValue}
              onChange={(e) => handleBranchChange(edge.id, e.target.value)}
              placeholder="branch name"
              className={isDuplicate ? "border-red-500" : ""}
            />
            <span className="shrink-0 text-[10px] text-zinc-500">→</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400">
              {targetLabel}
            </span>
          </div>
        );
      })}
      {duplicates.size > 0 && (
        <p className="text-[10px] text-red-400">
          Duplicate branch names — each branch must be unique.
        </p>
      )}
    </div>
  );
}

export const ConditionBranchEditor = memo(ConditionBranchEditorComponent);
