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
  useMemo,
  useState,
} from "react";

interface InputMapRow {
  param: string;
  stateKey: string;
  isAutoFilled: boolean;
  customMode: boolean;
}

interface Preset {
  label: string;
  value: string;
}

function buildPresets(stateFields: { key: string; type: string }[]): Preset[] {
  const presets: Preset[] = [];
  for (const field of stateFields) {
    if (field.type === "list") {
      presets.push(
        { label: `Latest ${field.key} text`, value: `${field.key}[0].content` },
        { label: `All ${field.key}`, value: field.key },
      );
    } else {
      presets.push({ label: field.key, value: field.key });
    }
  }
  return presets;
}

function toRows(inputMap: Record<string, string>): InputMapRow[] {
  return Object.entries(inputMap).map(([param, stateKey]) => ({
    param,
    stateKey,
    isAutoFilled: false,
    customMode: false,
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

  const presets = useMemo(() => buildPresets(stateFields), [stateFields]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on node.id to reset rows only when switching nodes, not on every keystroke
  useEffect(() => {
    setRows(
      toRows(node.config.input_map).map((row) => ({
        ...row,
        customMode:
          row.stateKey !== "" && !presets.some((p) => p.value === row.stateKey),
      })),
    );
  }, [node.id]);

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
      const toolName = e.target.value;
      onChange({ config: { tool_name: toolName } });

      // Auto-populate rows from tool params
      const selected = tools.find((t) => t.name === toolName);
      if (selected && selected.parameters.length > 0) {
        const currentMap = toRecord(rows);
        const newRows: InputMapRow[] = selected.parameters.map((p) => {
          const existingKey = currentMap[p.name] ?? "";
          return {
            param: p.name,
            stateKey: existingKey,
            isAutoFilled: true,
            customMode:
              existingKey !== "" &&
              !presets.some((pr) => pr.value === existingKey),
          };
        });
        setRows(newRows);
        onChange({ config: { input_map: toRecord(newRows) } });
      } else {
        setRows([]);
        onChange({ config: { input_map: {} } });
      }
    },
    [onChange, tools, rows, presets],
  );

  const handleOutputKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ config: { output_key: e.target.value } });
    },
    [onChange],
  );

  const handleSelectChange = useCallback(
    (index: number, value: string) => {
      if (value === "__custom__") {
        const updated = rows.map((row, i) =>
          i === index ? { ...row, customMode: true } : row,
        );
        setRows(updated);
      } else {
        const updated = rows.map((row, i) =>
          i === index ? { ...row, stateKey: value, customMode: false } : row,
        );
        setRows(updated);
        onChange({ config: { input_map: toRecord(updated) } });
      }
    },
    [rows, onChange],
  );

  const handleCustomInputChange = useCallback(
    (index: number, value: string) => {
      const updated = rows.map((row, i) =>
        i === index ? { ...row, stateKey: value } : row,
      );
      setRows(updated);
      onChange({ config: { input_map: toRecord(updated) } });
    },
    [rows, onChange],
  );

  const handleParamChange = useCallback(
    (index: number, value: string) => {
      const updated = rows.map((row, i) =>
        i === index ? { ...row, param: value } : row,
      );
      setRows(updated);
      onChange({ config: { input_map: toRecord(updated) } });
    },
    [rows, onChange],
  );

  const handleAddRow = useCallback(() => {
    const updated = [
      ...rows,
      { param: "", stateKey: "", isAutoFilled: false, customMode: false },
    ];
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

  const selectedTool = tools.find((t) => t.name === node.config.tool_name);

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
          Select a source for each parameter, or choose &lsquo;Custom
          expression&rsquo; for advanced mappings.
        </p>
        <div className="space-y-1.5">
          {rows.length > 0 && (
            <div className="mb-1 grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <span className="text-[10px] text-zinc-500">Tool param</span>
              <span className="text-[10px] text-zinc-500">From state</span>
              <span />
            </div>
          )}
          {rows.map((row, i) => {
            const paramInfo = selectedTool?.parameters.find(
              (p) => p.name === row.param,
            );
            const descText = paramInfo?.description ?? "";
            const exampleText = paramInfo?.examples?.[0]
              ? `e.g. ${paramInfo.examples[0]}`
              : "";
            const paramHint = row.customMode
              ? descText
                ? `Enter state expression for: ${descText}`
                : undefined
              : descText
                ? exampleText
                  ? `${descText} (${exampleText})`
                  : descText
                : undefined;

            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: row order is position-based
              <div key={i} className="flex flex-col gap-0.5">
                <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                  {row.isAutoFilled ? (
                    <span
                      className="flex items-center truncate rounded border border-zinc-700 bg-zinc-800/50 px-2 text-xs text-zinc-300"
                      title={paramInfo?.description}
                    >
                      {row.param}
                      {paramInfo && !paramInfo.required && (
                        <span className="ml-1 text-[10px] text-zinc-500">
                          (optional)
                        </span>
                      )}
                    </span>
                  ) : (
                    <Input
                      value={row.param}
                      onChange={(e) => handleParamChange(i, e.target.value)}
                      placeholder="param"
                    />
                  )}
                  <div className="flex flex-col gap-1">
                    <Select
                      value={
                        row.customMode
                          ? "__custom__"
                          : (presets.find((p) => p.value === row.stateKey)
                              ?.value ?? "")
                      }
                      onChange={(e) => handleSelectChange(i, e.target.value)}
                      aria-label="Source state field"
                    >
                      <option value="">Select source…</option>
                      {presets.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                      <option value="__custom__">Custom expression…</option>
                    </Select>
                    {row.customMode && (
                      <Input
                        value={row.stateKey}
                        onChange={(e) =>
                          handleCustomInputChange(i, e.target.value)
                        }
                        placeholder="messages[0].content"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveRow(i)}
                    className="flex items-center justify-center rounded p-1 text-zinc-500 hover:text-red-400"
                    aria-label="Remove mapping"
                  >
                    <X size={12} />
                  </button>
                </div>
                {paramHint && (
                  <p className="pl-1 text-[10px] text-zinc-500">{paramHint}</p>
                )}
              </div>
            );
          })}
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
