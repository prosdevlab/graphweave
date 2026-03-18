import { useGraphStore } from "@store/graphSlice";
import { useSettingsStore } from "@store/settingsSlice";
import { Button } from "@ui/Button";
import { Dialog } from "@ui/Dialog";
import { useEffect, useMemo, useState } from "react";
import { RunFormFields } from "./RunFormFields";
import {
  buildFieldHints,
  buildFormValues,
  buildScaffold,
  classifyFields,
  formValuesToInput,
  inputToFormValues,
  isMessagesField,
} from "./runInputUtils";

interface RunInputDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: Record<string, unknown>) => void;
}

export function RunInputDialog({
  open,
  onClose,
  onSubmit,
}: RunInputDialogProps) {
  const graph = useGraphStore((s) => s.graph);
  const tools = useSettingsStore((s) => s.tools);
  const loadTools = useSettingsStore((s) => s.loadTools);
  const toolsError = useSettingsStore((s) => s.toolsError);

  const [mode, setMode] = useState<"form" | "json">("form");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [jsonValue, setJsonValue] = useState("{}");
  const [parseError, setParseError] = useState<string | null>(null);
  const [prefilledKeys, setPrefilledKeys] = useState<Set<string>>(new Set());

  const { inputFields, outputKeys, outputKeyWriters } = classifyFields(
    graph?.state ?? [],
    graph?.nodes ?? [],
  );

  const hasInputFields = inputFields.length > 0;

  const fieldHints = useMemo(
    () => buildFieldHints(graph?.nodes ?? [], tools),
    [graph?.nodes, tools],
  );

  // Ensure tools are loaded (user may not have opened ToolNodeConfig)
  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      const { inputFields: fields } = classifyFields(
        graph?.state ?? [],
        graph?.nodes ?? [],
      );
      const hints = buildFieldHints(graph?.nodes ?? [], tools);
      const defaults = buildFormValues(fields);

      // Apply pre-fills from hints
      const prefilled = new Set<string>();
      for (const field of fields) {
        const hint = hints[field.key]?.[0];
        if (hint?.defaultValue && !isMessagesField(field)) {
          defaults[field.key] =
            field.type === "number"
              ? Number(hint.defaultValue)
              : hint.defaultValue;
          prefilled.add(field.key);
        }
      }

      setFormValues(defaults);
      setPrefilledKeys(prefilled);
      const scaffold = buildScaffold(fields);
      setJsonValue(
        Object.keys(scaffold).length > 0
          ? JSON.stringify(scaffold, null, 2)
          : "{}",
      );
      setParseError(null);
      setMode(fields.length > 0 ? "form" : "json");
    }
  }, [open, graph, tools]);

  const handleModeSwitch = (next: "form" | "json") => {
    if (next === mode) return;

    if (next === "json") {
      // Sync form → JSON
      const input = formValuesToInput(formValues, inputFields, prefilledKeys);
      const scaffold = buildScaffold(inputFields);
      const merged = { ...scaffold, ...input };
      setJsonValue(JSON.stringify(merged, null, 2));
    } else {
      // Sync JSON → form (best effort)
      try {
        const parsed: unknown = JSON.parse(jsonValue);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          !Array.isArray(parsed)
        ) {
          setFormValues(
            inputToFormValues(parsed as Record<string, unknown>, inputFields),
          );
          setParseError(null);
        } else {
          setFormValues(buildFormValues(inputFields));
          setParseError("Could not parse JSON — form reset to defaults");
        }
      } catch {
        setFormValues(buildFormValues(inputFields));
        setParseError("Could not parse JSON — form reset to defaults");
      }
    }
    setMode(next);
  };

  const handleFormChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (mode === "form") {
      const input = formValuesToInput(formValues, inputFields, prefilledKeys);
      onSubmit(input);
      return;
    }

    // JSON mode
    try {
      const parsed: unknown = JSON.parse(jsonValue);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setParseError("Input must be a JSON object");
        return;
      }
      setParseError(null);
      onSubmit(parsed as Record<string, unknown>);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Run Graph">
      <div className="flex flex-col gap-3">
        {hasInputFields && (
          <div className="flex gap-1 border-b border-zinc-700 pb-2">
            <button
              type="button"
              onClick={() => handleModeSwitch("form")}
              className={`rounded px-3 py-1 text-sm ${
                mode === "form"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              Form
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch("json")}
              className={`rounded px-3 py-1 text-sm ${
                mode === "json"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              JSON
            </button>
          </div>
        )}

        {toolsError && !tools.length && (
          <p className="text-xs text-amber-400">
            Could not load tool metadata — hints unavailable
          </p>
        )}

        {mode === "form" && hasInputFields ? (
          <RunFormFields
            inputFields={inputFields}
            outputKeys={outputKeys}
            outputKeyWriters={outputKeyWriters}
            values={formValues}
            onChange={handleFormChange}
            fieldHints={fieldHints}
          />
        ) : (
          <label className="text-sm text-zinc-400">
            Initial input (JSON)
            <textarea
              value={jsonValue}
              onChange={(e) => {
                setJsonValue(e.target.value);
                setParseError(null);
              }}
              className="mt-1 block w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500"
              rows={6}
            />
          </label>
        )}

        {parseError && <p className="text-sm text-red-400">{parseError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Start
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
