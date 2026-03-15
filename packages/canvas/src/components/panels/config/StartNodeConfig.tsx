import { Input } from "@ui/Input";
import { type ChangeEvent, memo, useCallback } from "react";

interface StartNodeConfigProps {
  node: { label: string };
  onChange: (updates: { label?: string }) => void;
}

function StartNodeConfigComponent({ node, onChange }: StartNodeConfigProps) {
  const handleLabelChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange({ label: e.target.value });
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
          placeholder="Start"
        />
      </div>
      <p className="text-xs text-zinc-500">
        Entry point of the graph. No additional configuration.
      </p>
    </div>
  );
}

export const StartNodeConfig = memo(StartNodeConfigComponent);
