import { useGraphStore } from "@store/graphSlice";
import { Button } from "@ui/Button";
import { CheckCircle2, Copy, Download, XCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { validateGraph } from "../../utils/validateGraph";

export function SchemaPanel() {
  const graph = useGraphStore((s) => s.graph);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const [copied, setCopied] = useState(false);

  const schemaJson = useMemo(() => {
    if (!graph) return "";
    return JSON.stringify(graph, null, 2);
  }, [graph]);

  const validationErrors = useMemo(
    () => validateGraph(nodes, edges),
    [nodes, edges],
  );

  const isValid = validationErrors.length === 0;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(schemaJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write may fail in non-secure contexts
    }
  }, [schemaJson]);

  const handleDownload = useCallback(() => {
    if (!graph) return;
    const blob = new Blob([schemaJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${graph.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [graph, schemaJson]);

  if (!graph) {
    return (
      <p className="mt-8 text-center text-sm text-zinc-500">No graph loaded.</p>
    );
  }

  return (
    <>
      {/* Validation badge */}
      <div className="mb-3 flex items-center gap-2">
        {isValid ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">
            <CheckCircle2 size={12} />
            Valid
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">
            <XCircle size={12} />
            {validationErrors.length} error
            {validationErrors.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="mb-3 flex gap-2">
        <Button variant="ghost" onClick={handleCopy}>
          <Copy size={12} className="mr-1" />
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button variant="ghost" onClick={handleDownload}>
          <Download size={12} className="mr-1" />
          Download .json
        </Button>
      </div>

      {/* Schema JSON */}
      <pre className="overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300">
        {schemaJson}
      </pre>
    </>
  );
}
