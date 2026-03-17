import type { HumanInputNode } from "@shared/schema";
import { Input } from "@ui/Input";
import { Textarea } from "@ui/Textarea";
import { type ChangeEvent, memo, useCallback } from "react";

interface HumanInputNodeConfigProps {
  node: HumanInputNode;
  onChange: (updates: {
    label?: string;
    config?: Partial<HumanInputNode["config"]>;
  }) => void;
}

function HumanInputNodeConfigComponent({
  node,
  onChange,
}: HumanInputNodeConfigProps) {
  const handleLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value });
    },
    [onChange],
  );

  const handlePromptChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange({ config: { prompt: e.target.value } });
    },
    [onChange],
  );

  const handleInputKeyChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ config: { input_key: e.target.value } });
    },
    [onChange],
  );

  const handleTimeoutChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(e.target.value, 10);
      const timeout_ms = Number.isNaN(parsed) || parsed <= 0 ? 300000 : parsed;
      onChange({ config: { timeout_ms } });
    },
    [onChange],
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
          placeholder="Human Input"
        />
      </div>

      <div>
        <label
          htmlFor="node-prompt"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Prompt
        </label>
        <Textarea
          id="node-prompt"
          value={node.config.prompt}
          onChange={handlePromptChange}
          rows={3}
          placeholder="Please provide input:"
        />
      </div>

      <div>
        <label
          htmlFor="node-input-key"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Input Key
        </label>
        <Input
          id="node-input-key"
          value={node.config.input_key}
          onChange={handleInputKeyChange}
          placeholder="user_input"
        />
      </div>

      <div>
        <label
          htmlFor="node-timeout"
          className="mb-1 block text-xs font-medium text-zinc-400"
        >
          Timeout (ms)
        </label>
        <Input
          id="node-timeout"
          type="number"
          value={node.config.timeout_ms ?? 300000}
          onChange={handleTimeoutChange}
          min={1000}
          step={1000}
        />
      </div>

      <p className="text-xs text-zinc-500">
        The graph will pause at this node and wait for user input. The response
        is stored in the state key specified above.
      </p>
    </div>
  );
}

export const HumanInputNodeConfig = memo(HumanInputNodeConfigComponent);
