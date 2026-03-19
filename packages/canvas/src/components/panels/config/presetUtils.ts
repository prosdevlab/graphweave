import type { ToolParameter } from "@api/settings";
import type { StateField } from "@shared/schema";

export interface Preset {
  label: string;
  value: string;
}

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "list"
  | "object"
  | "unknown";

export interface InputMapRow {
  param: string;
  stateKey: string;
  isAutoFilled: boolean;
  customMode: boolean;
}

/** Build type-filtered presets with friendly labels.
 *  - paramType "string": list fields as {key}[-1].content, string fields as {key}
 *  - paramType "number": number fields only
 *  - paramType undefined: all presets (for custom rows)
 *  Hidden for string/number: raw list references */
export function buildPresetsForParam(
  stateFields: { key: string; type: string }[],
  paramType?: string,
): Preset[] {
  const presets: Preset[] = [];
  for (const field of stateFields) {
    if (field.type === "list") {
      if (!paramType || paramType === "string") {
        const label =
          field.key === "messages"
            ? "User's message"
            : `Latest ${field.key} entry`;
        presets.push({ label, value: `${field.key}[-1].content` });
      }
      // Raw list reference only for custom rows (no paramType)
      if (!paramType) {
        const label =
          field.key === "messages"
            ? "Full message history"
            : `All ${field.key} entries`;
        presets.push({ label, value: field.key });
      }
    } else if (field.type === "number") {
      if (!paramType || paramType === "number") {
        presets.push({ label: field.key, value: field.key });
      }
    } else if (field.type === "string") {
      if (!paramType || paramType === "string") {
        presets.push({ label: field.key, value: field.key });
      }
    } else if (field.type === "object") {
      // Tool outputs are registered as "object" — allow for string params too
      if (!paramType || paramType === "string" || paramType === "object") {
        presets.push({ label: field.key, value: field.key });
      }
    } else {
      // boolean — shown for undefined or exact type match
      if (!paramType || paramType === field.type) {
        presets.push({ label: field.key, value: field.key });
      }
    }
  }
  return presets;
}

/** Human-readable label for a mapping's source expression.
 *  Used in the collapsed summary row. */
export function resolveSourceLabel(
  stateKey: string,
  stateFields: { key: string; type: string }[],
  defaultValue?: string | null,
): string {
  if (!stateKey) return "⚠ unmapped";
  if (stateKey === "__default__") {
    return defaultValue ? `default (${defaultValue})` : "default";
  }
  if (stateKey === "user_input") return "user input";
  if (stateKey === "messages[-1].content") return "your message"; // manual selection
  // Quoted literal (e.g. '"now"') → show as default(value)
  const quotedMatch = /^"([^"]*)"$/.exec(stateKey);
  if (quotedMatch) return `default (${quotedMatch[1]})`;
  // Known state field
  const field = stateFields.find((f) => f.key === stateKey);
  if (field) return field.key;
  // Other [-1].content expression
  const lastContentMatch = /^(\w+)\[-1\]\.content$/.exec(stateKey);
  if (lastContentMatch) return `latest ${lastContentMatch[1]} entry`;
  // Custom expression — truncate if long
  if (stateKey.length > 30) return `${stateKey.slice(0, 27)}...`;
  return stateKey;
}

/** Infer the runtime type that an expression will yield. */
export function getExpressionYieldType(
  stateKey: string,
  customMode: boolean,
  stateFields: { key: string; type: string }[],
): FieldType {
  if (customMode || !stateKey) return "unknown";
  if (/^\w+\[-1\]\.content$/.test(stateKey)) return "string";
  const field = stateFields.find((f) => f.key === stateKey);
  return (field?.type as FieldType | undefined) ?? "unknown";
}

/** Return an inline warning string for a mapping row, or null if valid. */
export function getMappingWarning(
  paramType: string | undefined,
  yieldType: FieldType,
  required: boolean,
  stateKey: string,
): string | null {
  if (required && !stateKey) return "Required — select a source";
  if (yieldType === "unknown" || !paramType) return null;
  if (paramType === "string" && yieldType === "list") {
    return 'Passes a full list — use "Latest … text" to get the text content';
  }
  if (
    paramType === "string" &&
    (yieldType === "object" || yieldType === "boolean")
  ) {
    return `Expects a string, but source is ${yieldType}`;
  }
  if (paramType === "number" && yieldType !== "number") {
    return `Expects a number, but source is ${yieldType}`;
  }
  return null;
}

/** Filter __default__ sentinel before persisting to input_map. */
export function toRecord(rows: InputMapRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    if (row.param && row.stateKey !== "__default__") {
      record[row.param] = row.stateKey;
    }
  }
  return record;
}

function isTypeCompatible(paramType: string, fieldType: string): boolean {
  if (paramType === "string" && fieldType === "string") return true;
  if (paramType === "number" && fieldType === "number") return true;
  if (paramType === "boolean" && fieldType === "boolean") return true;
  if (paramType === "object" && fieldType === "object") return true;
  if (paramType === "array" && fieldType === "list") return true;
  return false;
}

function paramTypeToStateFieldType(paramType: string): StateField["type"] {
  if (paramType === "number") return "number";
  if (paramType === "boolean") return "boolean";
  if (paramType === "object") return "object";
  if (paramType === "array") return "list";
  return "string";
}

/** A param is enum-like if it has a small set of short example values. */
export function isEnumLike(param: { examples?: string[] | null }): boolean {
  const ex = param.examples;
  if (!ex || ex.length < 2 || ex.length > 5) return false;
  return ex.every((e) => e.length <= 20);
}

export interface AutoMapResult {
  map: Record<string, string>;
  newFields: StateField[];
}

/** Auto-map tool params to state fields when a tool is selected.
 *  Precedence per param:
 *  1. Exact name match with compatible type → map to field.key
 *  2. Pre-selected `user_input` target (first required non-enum string, or
 *     first optional non-enum string if no required string params exist) → `user_input` (auto-created)
 *  3. Enum-like param with no explicit default → quoted literal of first example (e.g. `'"now"'`)
 *  4. Required, no match → auto-create state field with param name
 *  5. Optional with default → `__default__`
 *  6. Required name collision with incompatible field → `""` (warning) */
export function autoMapParams(
  toolParams: ToolParameter[],
  stateFields: StateField[],
): AutoMapResult {
  const map: Record<string, string> = {};
  const newFields: StateField[] = [];
  const newFieldKeys = new Set<string>();

  // Two-pass user_input assignment:
  // Pass 1: first required non-enum string param with no exact match gets user_input.
  // Pass 2: only when NO required string params exist at all, fall back to first
  //         optional non-enum string param with no exact match.
  let userInputTarget: string | null = null;
  const reqCandidate = toolParams.find(
    (p) =>
      p.type === "string" &&
      p.required &&
      !isEnumLike(p) &&
      !stateFields.find((f) => f.key === p.name),
  );
  if (reqCandidate) {
    userInputTarget = reqCandidate.name;
  } else {
    const hasRequiredStringParam = toolParams.some(
      (p) => p.type === "string" && p.required,
    );
    if (!hasRequiredStringParam) {
      const optCandidate = toolParams.find(
        (p) =>
          p.type === "string" &&
          !p.required &&
          !isEnumLike(p) &&
          !stateFields.find((f) => f.key === p.name),
      );
      if (optCandidate) userInputTarget = optCandidate.name;
    }
  }

  for (const param of toolParams) {
    const exactMatch = stateFields.find((f) => f.key === param.name);

    if (exactMatch) {
      if (isTypeCompatible(param.type, exactMatch.type)) {
        map[param.name] = param.name;
      } else if (param.required) {
        // Name collides with incompatible field → warning
        map[param.name] = "";
      } else if (param.default !== undefined && param.default !== null) {
        map[param.name] = "__default__";
      } else {
        map[param.name] = "";
      }
      continue;
    }

    // user_input fallback — only for the pre-selected target param
    if (param.name === userInputTarget) {
      const existing = stateFields.find(
        (f) => f.key === "user_input" && f.type === "string",
      );
      if (!existing && !newFieldKeys.has("user_input")) {
        newFields.push({
          key: "user_input",
          type: "string",
          reducer: "replace",
        });
        newFieldKeys.add("user_input");
      }
      map[param.name] = "user_input";
      continue;
    }

    // Enum-like with no explicit default → quoted literal of first example.
    // Params with an explicit default fall through to the __default__ block below.
    if (
      isEnumLike(param) &&
      param.examples?.length &&
      (param.default === undefined || param.default === null)
    ) {
      map[param.name] = `"${param.examples[0]}"`;
      continue;
    }

    // Required → auto-create state field
    if (param.required) {
      if (!newFieldKeys.has(param.name)) {
        newFields.push({
          key: param.name,
          type: paramTypeToStateFieldType(param.type),
          reducer: "replace",
        });
        newFieldKeys.add(param.name);
      }
      map[param.name] = param.name;
      continue;
    }

    // Optional with default → "__default__"
    if (param.default !== undefined && param.default !== null) {
      map[param.name] = "__default__";
      continue;
    }

    // Optional without default, no match
    map[param.name] = "";
  }

  return { map, newFields };
}
