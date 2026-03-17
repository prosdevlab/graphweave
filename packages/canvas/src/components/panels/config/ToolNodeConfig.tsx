import type { ToolNode } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { useSettingsStore } from "@store/settingsSlice";
import { Input } from "@ui/Input";
import { Select } from "@ui/Select";
import { Plus, X } from "lucide-react";
import {
  type ChangeEvent,
  memo,
  useCallback,
  useEffect,
  useState,
} from "react";

interface InputMapRow {
  param: string;
  stateKey: string;
}

function toRows(inputMap: Record<string, string>): InputMapRow[] {
  return Object.entries(inputMap).map(([param, stateKey]) => ({
    param,
    stateKey,
  }));
}

function toRecord(rows: InputMapRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    if (row.param) {
      record[row.param] = row.stateKey;
    }
  }
  return record;
}

interface ToolNodeConfigProps {
  node: ToolNode;
  onChange: (updates: {
    label?: string;
    config?: Partial<ToolNode["config"]>;
  }) => void;
}

function ToolNodeConfigComponent({ node, onChange }: ToolNodeConfigProps) {
  const tools = useSettingsStore((s) => s.tools);
  const toolsLoaded = useSettingsStore((s) => s.toolsLoaded);
  const toolsError = useSettingsStore((s) => s.toolsError);
  const loadTools = useSettingsStore((s) => s.loadTools);
  const stateFields = useGraphStore((s) => s.graph?.state ?? []);

  const [rows, setRows] = useState<InputMapRow[]>(() =>
    toRows(node.config.input_map),
  );

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const handleLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value });
    },
    [onChange],
  );

  const handleToolChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onChange({ config: { tool_name: e.target.value } });
    },
    [onChange],
  );

  const handleOutputKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ config: { output_key: e.target.value } });
    },
    [onChange],
  );

  const handleRowChange = useCallback(
    (index: number, field: "param" | "stateKey", value: string) => {
      const updated = rows.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      );
      setRows(updated);
      onChange({ config: { input_map: toRecord(updated) } });
    },
    [rows, onChange],
  );

  const handleAddRow = useCallback(() => {
    const updated = [...rows, { param: "", stateKey: "" }];
    setRows(updated);
  }, [rows]);

  const handleRemoveRow = useCallback(
    (index: number) => {
      const updated = rows.filter((_, i) => i !== index);
      setRows(updated);
      onChange({ config: { input_map: toRecord(updated) } });
    },
    [rows, onChange],
  );

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="node-label"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Label
        </label>
        <Input
          id="node-label"
          value={node.label}
          onChange={handleLabelChange}
          placeholder="Tool"
        />
      </div>

      <div>
        <label
          htmlFor="node-tool"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Tool
        </label>
        {toolsError && (
          <p className="mb-1 text-xs text-red-400">{toolsError}</p>
        )}
        <Select
          id="node-tool"
          value={node.config.tool_name}
          onChange={handleToolChange}
          disabled={!toolsLoaded && !toolsError}
        >
          <option value="">
            {toolsLoaded ? "Select a tool…" : "Loading tools…"}
          </option>
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-zinc-400">
          Input Mapping
        </span>
        <p className="mb-2 text-[10px] text-zinc-500">
          Map tool parameters to state fields or literal values. Use{" "}
          <code className="rounded bg-zinc-800 px-0.5">
            messages[0].content
          </code>{" "}
          for the latest user message, or{" "}
          <code className="rounded bg-zinc-800 px-0.5">"literal"</code> for a
          fixed string.
        </p>
        <div className="space-y-1.5">
          {rows.length > 0 && (
            <div className="mb-1 grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <span className="text-[10px] text-zinc-500">Tool param</span>
              <span className="text-[10px] text-zinc-500">From state</span>
              <span />
            </div>
          )}
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: row order is position-based
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <Input
                value={row.param}
                onChange={(e) => handleRowChange(i, "param", e.target.value)}
                placeholder="param"
              />
              <>
                <Input
                  value={row.stateKey}
                  onChange={(e) =>
                    handleRowChange(i, "stateKey", e.target.value)
                  }
                  placeholder="messages[0].content"
                  list={`state-fields-${i}`}
                />
                <datalist id={`state-fields-${i}`}>
                  {stateFields.map((f) => (
                    <option key={f.key} value={f.key} />
                  ))}
                </datalist>
              </>
              <button
                type="button"
                onClick={() => handleRemoveRow(i)}
                className="flex items-center justify-center rounded p-1 text-zinc-500 hover:text-red-400"
                aria-label="Remove mapping"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <Plus size={12} />
              Add mapping
            </button>
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="node-output-key"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Output Key
        </label>
        <Input
          id="node-output-key"
          value={node.config.output_key}
          onChange={handleOutputKeyChange}
          placeholder="tool_result"
        />
      </div>
    </div>
  );
}

export const ToolNodeConfig = memo(ToolNodeConfigComponent);
