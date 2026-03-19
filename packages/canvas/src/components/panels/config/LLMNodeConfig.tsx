import type { LLMNode } from "@shared/schema";
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
import { Textarea } from "@ui/Textarea";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
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
  isTerminalNode,
} from "../../../utils/graphTraversal";
import {
  type InputMapRow,
  buildPresetsForParam,
  getExpressionYieldType,
  getMappingWarning,
  resolveSourceLabel,
  toRecord,
} from "./presetUtils";

const PROVIDERS = ["openai", "gemini", "anthropic"] as const;

const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
};

function toRows(inputMap: Record<string, string>): InputMapRow[] {
  return Object.entries(inputMap).map(([param, stateKey]) => ({
    param,
    stateKey,
    isAutoFilled: false,
    customMode: false,
  }));
}

interface LLMNodeConfigProps {
  node: LLMNode;
  onChange: (updates: {
    label?: string;
    config?: Partial<LLMNode["config"]>;
  }) => void;
}

function LLMNodeConfigComponent({ node, onChange }: LLMNodeConfigProps) {
  const stateFields = useGraphStore((s) => s.graph?.state ?? []);
  const graphNodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const providers = useSettingsStore((s) => s.providers);
  const loadProviders = useSettingsStore((s) => s.loadProviders);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const [rows, setRows] = useState<InputMapRow[]>(() =>
    toRows(node.config.input_map),
  );
  const [expanded, setExpanded] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(
    !node.config.provider || !node.config.model,
  );

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

  const filteredPresets = useMemo(
    () => buildPresetsForParam(relevantFields),
    [relevantFields],
  );

  const allMapped = rows.length > 0 && rows.every((r) => r.stateKey !== "");

  // Auto-reset empty output_key when hidden to avoid silent validation errors
  useEffect(() => {
    if (isTerminal && !node.config.output_key.trim()) {
      onChange({ config: { output_key: "llm_response" } });
    }
  }, [isTerminal, node.config.output_key, onChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on node.id to reset rows only when switching nodes
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

  const models = useMemo(() => {
    const fetched = providers?.[node.config.provider]?.models;
    const list =
      fetched && fetched.length > 0
        ? fetched
        : (FALLBACK_MODELS[node.config.provider] ?? []);
    // Preserve current model if not in list (e.g. custom/fine-tuned model)
    if (node.config.model && !list.includes(node.config.model)) {
      return [node.config.model, ...list];
    }
    return list;
  }, [providers, node.config.provider, node.config.model]);

  const handleLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value });
    },
    [onChange],
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      const provider = value as LLMNode["config"]["provider"];
      const fetched = providers?.[provider]?.models;
      const providerModels =
        fetched && fetched.length > 0
          ? fetched
          : (FALLBACK_MODELS[provider] ?? []);
      onChange({ config: { provider, model: providerModels[0] ?? "" } });
    },
    [onChange, providers],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      onChange({ config: { model: value } });
    },
    [onChange],
  );

  const handleSystemPromptChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange({ config: { system_prompt: e.target.value } });
    },
    [onChange],
  );

  const handleTemperatureChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ config: { temperature: Number.parseFloat(e.target.value) } });
    },
    [onChange],
  );

  const handleMaxTokensChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ config: { max_tokens: Number.parseInt(e.target.value, 10) } });
    },
    [onChange],
  );

  const handleOutputKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ config: { output_key: e.target.value } });
    },
    [onChange],
  );

  const handleAddRow = useCallback(() => {
    const updated = [
      ...rows,
      { param: "", stateKey: "", isAutoFilled: false, customMode: false },
    ];
    setRows(updated);
    setExpanded(true);
  }, [rows]);

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
          placeholder="LLM"
        />
      </div>

      {/* Collapsible Model Settings */}
      <div>
        <button
          type="button"
          onClick={() => setModelSettingsOpen(!modelSettingsOpen)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-200"
        >
          {modelSettingsOpen ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          Model Settings
        </button>
        {modelSettingsOpen && (
          <div className="mt-2 space-y-3">
            <div>
              <label
                htmlFor="node-provider"
                className="mb-1 block text-xs font-medium text-zinc-400"
              >
                Provider
              </label>
              <Select
                value={node.config.provider}
                onValueChange={handleProviderChange}
              >
                <SelectTrigger id="node-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="node-model"
                className="mb-1 block text-xs font-medium text-zinc-400"
              >
                Model
              </label>
              <Select
                value={node.config.model}
                onValueChange={handleModelChange}
              >
                <SelectTrigger id="node-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="node-temperature"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Temperature
                </label>
                <Input
                  id="node-temperature"
                  type="number"
                  value={node.config.temperature}
                  onChange={handleTemperatureChange}
                  step={0.1}
                  min={0}
                  max={2}
                />
              </div>
              <div>
                <label
                  htmlFor="node-max-tokens"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Max Tokens
                </label>
                <Input
                  id="node-max-tokens"
                  type="number"
                  value={node.config.max_tokens}
                  onChange={handleMaxTokensChange}
                  step={128}
                  min={1}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="node-system-prompt"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          System Prompt
        </label>
        <Textarea
          id="node-system-prompt"
          value={node.config.system_prompt}
          onChange={handleSystemPromptChange}
          rows={4}
          placeholder="You are a helpful assistant..."
        />
      </div>

      {/* Input Mappings */}
      <div>
        <span className="mb-1 block text-xs font-medium text-zinc-400">
          This node reads from
        </span>

        {rows.length === 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] text-zinc-500">
              No mappings configured. Uses conversation history (messages). To
              pass specific data from other nodes, add a mapping.
            </p>
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <Plus size={12} />
              Add mapping
            </button>
          </div>
        ) : !expanded ? (
          <div className="space-y-1">
            {rows.map((row) => {
              const mapped = row.stateKey !== "";
              const label = resolveSourceLabel(row.stateKey, stateFields, null);
              return (
                <button
                  key={row.param || `unmapped-${row.stateKey}`}
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="flex w-full items-center gap-2 text-xs hover:bg-zinc-800/50"
                >
                  <Check
                    size={12}
                    className={mapped ? "text-emerald-400" : "text-amber-400"}
                  />
                  <span className="text-zinc-300">
                    {row.param || "(unnamed)"}
                  </span>
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
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <Plus size={12} />
              Add mapping
            </button>
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
              const yieldType = getExpressionYieldType(
                row.stateKey,
                row.customMode,
                stateFields,
              );
              const mappingWarning = getMappingWarning(
                undefined,
                yieldType,
                false,
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
                    <Input
                      value={row.param}
                      onChange={(e) => handleParamChange(i, e.target.value)}
                      placeholder="param_name"
                      className="h-6 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(i)}
                      className="flex items-center justify-center rounded p-0.5 text-zinc-500 hover:text-red-400"
                      aria-label="Remove mapping"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <Select
                    value={selectValue || undefined}
                    onValueChange={(v) => handleSelectChange(i, v)}
                  >
                    <SelectTrigger aria-label="Source state field">
                      <SelectValue placeholder="Select source…" />
                    </SelectTrigger>
                    <SelectContent>
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
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <Plus size={12} />
              Add mapping
            </button>
          </div>
        )}
      </div>

      {!isTerminal && (
        <div>
          <label
            htmlFor="node-output-key"
            className="mb-1 block text-xs font-medium text-zinc-400"
          >
            Result saved to
          </label>
          <p className="mb-1 text-[10px] text-zinc-500">
            Other nodes use this name to access this LLM's output.
          </p>
          <Input
            id="node-output-key"
            value={node.config.output_key}
            onChange={handleOutputKeyChange}
            placeholder="llm_response"
          />
        </div>
      )}
    </div>
  );
}

export const LLMNodeConfig = memo(LLMNodeConfigComponent);
