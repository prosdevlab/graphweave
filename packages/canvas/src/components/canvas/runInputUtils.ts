import type { NodeSchema, StateField } from "@shared/schema";

// -- Field hints ---------------------------------------------------------

export interface FieldHint {
  description: string;
  source: string;
  placeholder?: string;
  defaultValue?: string;
  examples?: string[];
}

export type FieldHints = Record<string, FieldHint[]>;

export function extractRootKey(expr: string): string {
  const match = /^([^.[]+)/.exec(expr);
  return match?.[1] ?? "";
}

export function buildFieldHints(
  nodes: NodeSchema[],
  tools: Array<{
    name: string;
    parameters: Array<{
      name: string;
      description: string;
      default?: string | null;
      examples?: string[] | null;
    }>;
  }>,
): FieldHints {
  // Build lookup: toolName → paramName → metadata
  const toolLookup = new Map<
    string,
    Map<
      string,
      {
        description: string;
        default?: string | null;
        examples?: string[] | null;
      }
    >
  >();
  for (const tool of tools) {
    const paramMap = new Map<
      string,
      {
        description: string;
        default?: string | null;
        examples?: string[] | null;
      }
    >();
    for (const p of tool.parameters) {
      paramMap.set(p.name, {
        description: p.description,
        default: p.default,
        examples: p.examples,
      });
    }
    toolLookup.set(tool.name, paramMap);
  }

  const hints: FieldHints = {};

  for (const node of nodes) {
    if (node.type !== "tool" && node.type !== "llm") continue;

    const inputMap = node.config.input_map;
    if (!inputMap || Object.keys(inputMap).length === 0) continue;

    for (const [paramName, stateExpr] of Object.entries(inputMap)) {
      if (!stateExpr) continue;

      const rootKey = extractRootKey(stateExpr);
      if (!rootKey) continue;

      let hint: FieldHint;

      if (node.type === "tool") {
        if (!node.config.tool_name) continue;
        const paramMeta = toolLookup.get(node.config.tool_name)?.get(paramName);
        const source = `${node.label} (${node.config.tool_name})`;
        if (paramMeta) {
          hint = {
            description: paramMeta.description,
            source,
            placeholder: paramMeta.description,
            defaultValue: paramMeta.default ?? undefined,
            examples: paramMeta.examples ?? undefined,
          };
        } else {
          hint = { description: paramName, source };
        }
      } else {
        // LLM node
        hint = {
          description: "Input to LLM",
          source: `${node.label} (${node.config.model})`,
        };
      }

      if (!hints[rootKey]) hints[rootKey] = [];
      hints[rootKey].push(hint);
    }
  }

  return hints;
}

export function classifyFields(
  state: StateField[],
  nodes: NodeSchema[],
): {
  inputFields: StateField[];
  outputKeys: Set<string>;
  outputKeyWriters: Record<string, string>;
} {
  const outputKeys = new Set<string>();
  const outputKeyWriters: Record<string, string> = {};
  for (const node of nodes) {
    if (node.type === "llm" || node.type === "tool") {
      outputKeys.add(node.config.output_key);
      outputKeyWriters[node.config.output_key] = node.label;
    }
  }
  const inputFields = state.filter((f) => !outputKeys.has(f.key));
  return { inputFields, outputKeys, outputKeyWriters };
}

export function isMessagesField(field: StateField): boolean {
  return (
    field.key === "messages" &&
    field.type === "list" &&
    field.reducer === "append"
  );
}

export function buildFormValues(
  inputFields: StateField[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of inputFields) {
    if (isMessagesField(field)) {
      values[field.key] = "";
    } else if (field.type === "string") {
      values[field.key] = "";
    } else if (field.type === "number") {
      values[field.key] = 0;
    } else if (field.type === "boolean") {
      values[field.key] = false;
    } else if (field.type === "list") {
      values[field.key] = [];
    } else if (field.type === "object") {
      values[field.key] = {};
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

export function formValuesToInput(
  values: Record<string, unknown>,
  inputFields: StateField[],
  prefilledKeys?: Set<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of inputFields) {
    const value = values[field.key];
    const isPrefilled = prefilledKeys?.has(field.key) ?? false;
    if (isMessagesField(field)) {
      const text = typeof value === "string" ? value.trim() : "";
      if (text !== "") {
        result[field.key] = [{ role: "user", content: text }];
      }
    } else if (field.type === "string") {
      if (value !== "" || isPrefilled) {
        result[field.key] = value;
      }
    } else if (field.type === "number") {
      if (value !== 0 || isPrefilled) {
        result[field.key] = value;
      }
    } else if (field.type === "boolean") {
      if (value !== false || isPrefilled) {
        result[field.key] = value;
      }
    } else if (field.type === "list") {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length > 0 || isPrefilled) {
        result[field.key] = arr;
      }
    } else if (field.type === "object") {
      const obj =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? value
          : {};
      if (Object.keys(obj).length > 0 || isPrefilled) {
        result[field.key] = obj;
      }
    }
  }
  return result;
}

export function inputToFormValues(
  input: Record<string, unknown>,
  inputFields: StateField[],
): Record<string, unknown> {
  const defaults = buildFormValues(inputFields);
  const result: Record<string, unknown> = { ...defaults };
  for (const field of inputFields) {
    const value = input[field.key];
    if (value === undefined) continue;
    if (isMessagesField(field)) {
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === "object" &&
        value[0] !== null &&
        "content" in value[0]
      ) {
        result[field.key] =
          typeof (value[0] as Record<string, unknown>).content === "string"
            ? (value[0] as Record<string, unknown>).content
            : "";
      } else {
        result[field.key] = "";
      }
    } else {
      result[field.key] = value;
    }
  }
  return result;
}

export function buildScaffold(
  inputFields: StateField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of inputFields) {
    if (isMessagesField(field)) {
      result[field.key] = [{ role: "user", content: "" }];
    } else if (field.type === "string") {
      result[field.key] = "";
    } else if (field.type === "number") {
      result[field.key] = 0;
    } else if (field.type === "boolean") {
      result[field.key] = false;
    } else if (field.type === "list") {
      result[field.key] = [];
    } else if (field.type === "object") {
      result[field.key] = {};
    }
  }
  return result;
}
