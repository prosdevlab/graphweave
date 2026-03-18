import type { StateField } from "@shared/schema";
import { Combobox } from "@ui/Combobox";
import type { FieldHint, FieldHints } from "./runInputUtils";
import { isMessagesField } from "./runInputUtils";

interface RunFormFieldsProps {
  inputFields: StateField[];
  outputKeys: Set<string>;
  outputKeyWriters?: Record<string, string>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  fieldHints?: FieldHints;
}

export function RunFormFields({
  inputFields,
  outputKeys,
  outputKeyWriters,
  values,
  onChange,
  fieldHints,
}: RunFormFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {inputFields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(v) => onChange(field.key, v)}
          hints={fieldHints?.[field.key]}
        />
      ))}

      {outputKeys.size > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-zinc-500">── Produced by the graph ──</p>
          {[...outputKeys].map((key) => (
            <p key={key} className="text-sm text-zinc-500">
              {key}
              {outputKeyWriters?.[key] && (
                <span className="ml-2 text-zinc-600">
                  ← {outputKeyWriters[key]}
                </span>
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldControlProps {
  field: StateField;
  value: unknown;
  onChange: (value: unknown) => void;
  hints?: FieldHint[];
}

function dedupeBySource(hints: FieldHint[]): FieldHint[] {
  const seen = new Set<string>();
  return hints.filter((h) => {
    if (seen.has(h.source)) return false;
    seen.add(h.source);
    return true;
  });
}

function MessageFieldGuidance({ hints }: { hints?: FieldHint[] }) {
  if (!hints || hints.length === 0) {
    return (
      <span className="text-xs text-zinc-500">Sent as a user message</span>
    );
  }

  if (hints.length === 1) {
    const hint = hints[0];
    if (!hint) return null;
    return (
      <span className="text-xs text-zinc-500">
        Your message is used as the {hint.description.toLowerCase()} (
        {hint.source})
      </span>
    );
  }

  const uniqueHints = dedupeBySource(hints);
  return (
    <div className="flex flex-col gap-0.5 text-xs text-zinc-500">
      <span>Your message is used as:</span>
      {uniqueHints.map((h) => (
        <span key={`${h.source}-${h.description}`} className="pl-2">
          · {h.description.toLowerCase()} ({h.source})
        </span>
      ))}
    </div>
  );
}

function HintSources({ hints }: { hints?: FieldHint[] }) {
  if (!hints || hints.length === 0) return null;
  const uniqueSources = [...new Set(hints.map((h) => h.source))];
  const display =
    uniqueSources.length > 3
      ? [...uniqueSources.slice(0, 3), `+${uniqueSources.length - 3} more`]
      : uniqueSources;
  return (
    <span className="text-xs text-zinc-500">Used by {display.join(", ")}</span>
  );
}

function resolveExamples(hints?: FieldHint[]): string[] {
  return hints?.flatMap((h) => h.examples ?? []) ?? [];
}

function resolvePlaceholder(
  hints?: FieldHint[],
  allExamples?: string[],
): string | undefined {
  const examples = allExamples ?? resolveExamples(hints);
  if (hints?.[0]?.placeholder) return hints[0].placeholder;
  if (examples.length === 1) return `e.g. ${examples[0]}`;
  return undefined;
}

function FieldControl({ field, value, onChange, hints }: FieldControlProps) {
  const allExamples = resolveExamples(hints);
  const placeholder = resolvePlaceholder(hints, allExamples);

  if (isMessagesField(field)) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">{field.key}</span>
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type your message..."
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <MessageFieldGuidance hints={hints} />
      </label>
    );
  }

  if (field.type === "string") {
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: Combobox renders a native input internally
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">{field.key}</span>
        {allExamples.length >= 2 ? (
          <Combobox
            value={typeof value === "string" ? value : ""}
            onChange={(v) => onChange(v)}
            options={allExamples}
            placeholder={placeholder}
          />
        ) : (
          <input
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
          />
        )}
        <HintSources hints={hints} />
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">{field.key}</span>
        <input
          type="number"
          value={typeof value === "number" ? value : 0}
          onChange={(e) => onChange(Number.parseFloat(e.target.value) || 0)}
          placeholder={placeholder}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <HintSources hints={hints} />
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={typeof value === "boolean" ? value : false}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-zinc-700 bg-zinc-800"
        />
        <span className="text-sm text-zinc-300">{field.key}</span>
      </label>
    );
  }

  if (field.type === "list") {
    const displayValue =
      Array.isArray(value) && value.length > 0
        ? JSON.stringify(value, null, 2)
        : "";
    const examplesHint =
      allExamples.length > 0 ? `e.g. ${allExamples.join(", ")}` : undefined;
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">{field.key}</span>
        <textarea
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              onChange([]);
              return;
            }
            try {
              const parsed: unknown = JSON.parse(raw);
              onChange(Array.isArray(parsed) ? parsed : []);
            } catch {
              onChange([]);
            }
          }}
          rows={3}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <span className="text-xs text-zinc-500">
          JSON array{examplesHint ? ` — ${examplesHint}` : ""}
        </span>
        <HintSources hints={hints} />
      </label>
    );
  }

  if (field.type === "object") {
    const displayValue =
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
        ? JSON.stringify(value, null, 2)
        : "";
    const examplesHint =
      allExamples.length > 0 ? `e.g. ${allExamples.join(", ")}` : undefined;
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300">{field.key}</span>
        <textarea
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              onChange({});
              return;
            }
            try {
              const parsed: unknown = JSON.parse(raw);
              onChange(
                parsed !== null &&
                  typeof parsed === "object" &&
                  !Array.isArray(parsed)
                  ? parsed
                  : {},
              );
            } catch {
              onChange({});
            }
          }}
          rows={3}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <span className="text-xs text-zinc-500">
          JSON object{examplesHint ? ` — ${examplesHint}` : ""}
        </span>
        <HintSources hints={hints} />
      </label>
    );
  }

  return null;
}
