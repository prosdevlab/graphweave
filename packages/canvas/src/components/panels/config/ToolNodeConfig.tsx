import type { ToolNode } from "@shared/schema";
import { useGraphStore } from "@store/graphSlice";
import { useSettingsStore } from "@store/settingsSlice";
import { Input } from "@ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/Select";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getRelevantFields,
  getUpstreamNodeIds,
  isTerminalNode,
} from "../../../utils/graphTraversal";
import {
  deduplicateOutputKey,
  isAutoOutputKey,
} from "../../../utils/nodeDefaults";
import {
  type InputMapRow,
  autoMapParams,
  buildPresetsForParam,
  getExpressionYieldType,
  getMappingWarning,
  isEnumLike,
  resolveSourceLabel,
  toRecord,
} from "./presetUtils";

function toRows(inputMap: Record<string, string>): InputMapRow[] {
  return Object.entries(inputMap).map(([param, stateKey]) => ({
    param,
    stateKey,
    isAutoFilled: false,
    customMode: false,
  }));
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
  const graphNodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const addStateFields = useGraphStore((s) => s.addStateFields);
  const removeStateFields = useGraphStore((s) => s.removeStateFields);

  const [rows, setRows] = useState<InputMapRow[]>(() =>
    toRows(node.config.input_map),
  );
  const [expanded, setExpanded] = useState(false);
  const allMapped = rows.length > 0 && rows.every((r) => r.stateKey !== "");
  const [autoCreatedKeys, setAutoCreatedKeys] = useState<string[]>([]);

  const sourceLabels = useMemo(() => {
    const upstreamIds = getUpstreamNodeIds(node.id, edges);
    const map = new Map<string, string[]>();
    for (const n of graphNodes) {
      if (!upstreamIds.has(n.id)) continue;
      if (n.type === "llm" || n.type === "tool") {
        const existing = map.get(n.config.output_key);
        if (existing) existing.push(n.label);
        else map.set(n.config.output_key, [n.label]);
      }
    }
    return map;
  }, [node.id, edges, graphNodes]);

  const allPresets = useMemo(
    () => buildPresetsForParam(stateFields),
    [stateFields],
  );

  const relevantFields = useMemo(
    () => getRelevantFields(node.id, stateFields, graphNodes, edges),
    [node.id, stateFields, graphNodes, edges],
  );

  const isTerminal = useMemo(
    () => isTerminalNode(node.id, edges, graphNodes),
    [node.id, edges, graphNodes],
  );

  // Auto-reset empty output_key when hidden to avoid silent validation errors
  useEffect(() => {
    if (isTerminal && !node.config.output_key.trim()) {
      onChange({ config: { output_key: "tool_result" } });
    }
  }, [isTerminal, node.config.output_key, onChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on node.id to reset rows only when switching nodes, not on every keystroke
  useEffect(() => {
    setRows(
      toRows(node.config.input_map).map((row) => ({
        ...row,
        customMode:
          row.stateKey !== "" &&
          row.stateKey !== "__default__" &&
          !allPresets.some((p) => p.value === row.stateKey),
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
    (toolName: string) => {
      // Cleanup orphaned auto-created fields from the previous tool
      if (autoCreatedKeys.length > 0) {
        const otherNodes = graphNodes.filter((n) => n.id !== node.id);
        const usedInOtherNodes = new Set(
          otherNodes
            .filter((n) => n.type === "tool" || n.type === "llm")
            .flatMap((n) => Object.values(n.config.input_map)),
        );
        const orphaned = autoCreatedKeys.filter(
          (k) => !usedInOtherNodes.has(k),
        );
        if (orphaned.length > 0) {
          removeStateFields(orphaned);
        }
      }

      // Auto-rename output_key when selecting a tool (if still auto-generated)
      const prevToolName = node.config.tool_name;
      let newOutputKey = node.config.output_key;
      if (isAutoOutputKey(node.config.output_key, prevToolName || undefined)) {
        const desired = `${toolName}_result`;
        const existingKeys = new Set(
          graphNodes
            .filter(
              (n) =>
                n.id !== node.id && (n.type === "tool" || n.type === "llm"),
            )
            .map((n) => (n.config as { output_key: string }).output_key),
        );
        newOutputKey = deduplicateOutputKey(desired, existingKeys);
      }

      const selected = tools.find((t) => t.name === toolName);
      if (selected && selected.parameters.length > 0) {
        const result = autoMapParams(selected.parameters, stateFields);
        setAutoCreatedKeys(result.newFields.map((f) => f.key));
        if (result.newFields.length > 0) {
          addStateFields(result.newFields);
        }
        const newRows: InputMapRow[] = selected.parameters.map((p) => ({
          param: p.name,
          stateKey: result.map[p.name] ?? "",
          isAutoFilled: true,
          customMode: false,
        }));
        setRows(newRows);
        onChange({
          config: {
            tool_name: toolName,
            input_map: toRecord(newRows),
            output_key: newOutputKey,
          },
        });
      } else {
        setAutoCreatedKeys([]);
        setRows([]);
        onChange({
          config: {
            tool_name: toolName,
            input_map: {},
            output_key: newOutputKey,
          },
        });
      }
    },
    [
      onChange,
      tools,
      stateFields,
      autoCreatedKeys,
      addStateFields,
      removeStateFields,
      graphNodes,
      node.id,
      node.config.output_key,
      node.config.tool_name,
    ],
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
          value={node.config.tool_name || undefined}
          onValueChange={handleToolChange}
          disabled={!toolsLoaded && !toolsError}
        >
          <SelectTrigger id="node-tool">
            <SelectValue
              placeholder={toolsLoaded ? "Select a tool…" : "Loading tools…"}
            />
          </SelectTrigger>
          <SelectContent>
            {tools.map((t) => (
              <SelectItem key={t.name} value={t.name}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-400">
            Parameters
          </span>

          {!expanded ? (
            <div className="space-y-1">
              {rows.map((row, i) => {
                const paramInfo = selectedTool?.parameters.find(
                  (p) => p.name === row.param,
                );
                const mapped = row.stateKey !== "";
                const isAutoCreated = autoCreatedKeys.includes(row.stateKey);
                const defaultDisplay =
                  paramInfo?.default ?? paramInfo?.examples?.[0] ?? null;
                const label =
                  resolveSourceLabel(
                    row.stateKey,
                    stateFields,
                    defaultDisplay,
                    sourceLabels,
                  ) + (isAutoCreated ? " (auto)" : "");
                return (
                  <button
                    key={row.param}
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex w-full items-center gap-2 text-xs hover:bg-zinc-800/50"
                  >
                    <Check
                      size={12}
                      className={mapped ? "text-emerald-400" : "text-amber-400"}
                    />
                    <span className="text-zinc-300">{row.param}</span>
                    <span className="text-zinc-600">←</span>
                    <span className="text-zinc-500">{label}</span>
                  </button>
                );
              })}
              {allMapped ? (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mt-1 text-[10px] text-zinc-600 hover:text-zinc-400"
                >
                  Customize
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mt-1 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                >
                  <ChevronRight size={12} />
                  Edit mappings
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <ChevronDown size={12} />
                Edit mappings
              </button>

              {rows.map((row, i) => {
                const paramInfo = selectedTool?.parameters.find(
                  (p) => p.name === row.param,
                );
                const descText = paramInfo?.description ?? "";
                const exampleText = paramInfo?.examples?.[0]
                  ? `e.g. ${paramInfo.examples[0]}`
                  : "";
                const descWithExamples = descText
                  ? exampleText
                    ? `${descText} (${exampleText})`
                    : descText
                  : undefined;

                const filteredPresets = buildPresetsForParam(
                  relevantFields,
                  paramInfo?.type,
                  sourceLabels,
                );
                const defaultDisplay =
                  paramInfo?.default ?? paramInfo?.examples?.[0];
                const hasDefault =
                  defaultDisplay !== undefined && defaultDisplay !== null;

                const yieldType = getExpressionYieldType(
                  row.stateKey,
                  row.customMode,
                  stateFields,
                );
                const mappingWarning = getMappingWarning(
                  paramInfo?.type,
                  yieldType,
                  paramInfo?.required ?? false,
                  row.stateKey === "__default__" ? "" : row.stateKey,
                );

                const selectValue = row.customMode
                  ? "__custom__"
                  : row.stateKey === "__default__"
                    ? "__default__"
                    : /^"[^"]*"$/.test(row.stateKey)
                      ? row.stateKey
                      : (filteredPresets.find((p) => p.value === row.stateKey)
                          ?.value ?? "");

                const cardCls =
                  "space-y-1.5 rounded border border-zinc-800 p-2.5";
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: position-based rows
                  <div key={i} className={cardCls}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200">
                        {row.isAutoFilled ? (
                          <>
                            {row.param}
                            {paramInfo?.required && (
                              <span className="ml-0.5 text-indigo-400">*</span>
                            )}
                          </>
                        ) : (
                          <Input
                            value={row.param}
                            onChange={(e) =>
                              handleParamChange(i, e.target.value)
                            }
                            placeholder="param"
                          />
                        )}
                      </span>
                      <div className="flex items-center gap-1">
                        {paramInfo?.type && (
                          <span className="text-[10px] text-zinc-600">
                            {paramInfo.type}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(i)}
                          className="flex items-center justify-center rounded p-0.5 text-zinc-500 hover:text-red-400"
                          aria-label="Remove mapping"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    </div>
                    {descWithExamples && (
                      <p className="text-[10px] text-zinc-500">
                        {descWithExamples}
                      </p>
                    )}
                    <Select
                      value={selectValue || undefined}
                      onValueChange={(v) => handleSelectChange(i, v)}
                    >
                      <SelectTrigger aria-label="Source state field">
                        <SelectValue placeholder="Select source…" />
                      </SelectTrigger>
                      <SelectContent>
                        {hasDefault && (
                          <SelectItem
                            value={
                              paramInfo?.default != null
                                ? "__default__"
                                : `"${defaultDisplay}"`
                            }
                          >
                            — Use default ({defaultDisplay}) —
                          </SelectItem>
                        )}
                        {filteredPresets.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">
                          Custom expression…
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {row.customMode && (
                      <Input
                        value={row.stateKey}
                        onChange={(e) =>
                          handleCustomInputChange(i, e.target.value)
                        }
                        placeholder="state_field_name"
                      />
                    )}
                    {mappingWarning && (
                      <p className="flex items-center gap-0.5 text-[10px] text-amber-400">
                        <AlertTriangle size={10} />
                        {mappingWarning}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isTerminal && (
        <div>
          <label
            htmlFor="node-output-key"
            className="mb-1 block text-xs font-medium text-zinc-400"
          >
            Result saved to
          </label>
          <Input
            id="node-output-key"
            value={node.config.output_key}
            onChange={handleOutputKeyChange}
            placeholder="tool_result"
          />
        </div>
      )}
    </div>
  );
}

export const ToolNodeConfig = memo(ToolNodeConfigComponent);
