import { Input } from "@ui/Input";
import { Select } from "@ui/Select";
import { Textarea } from "@ui/Textarea";
import { type ChangeEvent, memo, useCallback } from "react";

interface LLMConfig {
  provider: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  [key: string]: unknown;
}

interface LLMNodeConfigProps {
  node: { label: string; config: LLMConfig };
  onChange: (updates: {
    label?: string;
    config?: Partial<LLMConfig>;
  }) => void;
}

const PROVIDERS = ["openai", "gemini", "anthropic"] as const;

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  // TODO(C3): Fetch available models from /settings/providers
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
};

function LLMNodeConfigComponent({ node, onChange }: LLMNodeConfigProps) {
  const handleLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value });
    },
    [onChange],
  );

  const handleProviderChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const provider = e.target.value;
      const models = MODEL_OPTIONS[provider] ?? [];
      onChange({ config: { provider, model: models[0] ?? "" } });
    },
    [onChange],
  );

  const handleModelChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      onChange({ config: { model: e.target.value } });
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

  const models = MODEL_OPTIONS[node.config.provider] ?? [];

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

      <div>
        <label
          htmlFor="node-provider"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Provider
        </label>
        <Select
          id="node-provider"
          value={node.config.provider}
          onChange={handleProviderChange}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
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
          id="node-model"
          value={node.config.model}
          onChange={handleModelChange}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
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

      <p className="text-xs text-zinc-500">
        State wiring (input_map, output_key) configured in State panel (coming
        soon).
      </p>
    </div>
  );
}

export const LLMNodeConfig = memo(LLMNodeConfigComponent);
