import type { ValidationError } from "@api/graphs";
import { useCanvasContext } from "@contexts/CanvasContext";
import { Button } from "@ui/Button";
import { Dialog } from "@ui/Dialog";
import { AlertCircle, XCircle } from "lucide-react";
import { useCallback } from "react";

export interface ValidationItem {
  message: string;
  nodeId: string | null;
  severity: "error" | "warning";
}

interface ValidationErrorDialogProps {
  open: boolean;
  onClose: () => void;
  items: ValidationItem[];
  onRunAnyway?: () => void;
}

export function ValidationErrorDialog({
  open,
  onClose,
  items,
  onRunAnyway,
}: ValidationErrorDialogProps) {
  const { setSelectedNodeId, openSidePanel } = useCanvasContext();

  const errors = items.filter((i) => i.severity === "error");
  const warnings = items.filter((i) => i.severity === "warning");
  const hasErrors = errors.length > 0;

  const handleGoToNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      openSidePanel("config");
      onClose();
    },
    [setSelectedNodeId, openSidePanel, onClose],
  );

  const title = hasErrors ? "Validation Errors" : "Validation Warnings";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {hasErrors && (
        <p className="mb-3 text-xs text-zinc-400">
          {errors.length} error{errors.length > 1 ? "s" : ""} must be fixed
          before running:
        </p>
      )}

      <div className="space-y-2">
        {errors.map((item, i) => (
          <ValidationRow
            // biome-ignore lint/suspicious/noArrayIndexKey: validation items are static per render
            key={`e-${i}`}
            item={item}
            onGoToNode={handleGoToNode}
          />
        ))}
        {warnings.length > 0 && errors.length > 0 && (
          <div className="border-t border-zinc-800 pt-2" />
        )}
        {warnings.length > 0 && !hasErrors && (
          <p className="mb-3 text-xs text-zinc-400">
            {warnings.length} warning{warnings.length > 1 ? "s" : ""}:
          </p>
        )}
        {warnings.map((item, i) => (
          <ValidationRow
            // biome-ignore lint/suspicious/noArrayIndexKey: validation items are static per render
            key={`w-${i}`}
            item={item}
            onGoToNode={handleGoToNode}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        {!hasErrors && onRunAnyway && (
          <Button variant="ghost" onClick={onRunAnyway}>
            Run anyway
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          Fix issues
        </Button>
      </div>
    </Dialog>
  );
}

function ValidationRow({
  item,
  onGoToNode,
}: {
  item: ValidationItem;
  onGoToNode: (nodeId: string) => void;
}) {
  const isError = item.severity === "error";
  const Icon = isError ? XCircle : AlertCircle;
  const color = isError ? "text-red-400" : "text-amber-400";

  return (
    <div className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-800/30 px-3 py-2">
      <Icon size={14} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-300">{item.message}</p>
        {item.nodeId && (
          <button
            type="button"
            onClick={() => onGoToNode(item.nodeId as string)}
            className="mt-1 cursor-pointer text-[11px] text-indigo-400 hover:text-indigo-300"
          >
            Go to node
          </button>
        )}
      </div>
    </div>
  );
}

/** Convert server validation errors to ValidationItems */
export function fromServerErrors(errors: ValidationError[]): ValidationItem[] {
  return errors.map((e) => ({
    message: e.message,
    nodeId: e.node_ref,
    severity: "error" as const,
  }));
}

/** Convert client validation errors to ValidationItems */
export function fromClientErrors(
  errors: { message: string; nodeId?: string }[],
): ValidationItem[] {
  return errors.map((e) => ({
    message: e.message,
    nodeId: e.nodeId ?? null,
    severity: "error" as const,
  }));
}
