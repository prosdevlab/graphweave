import type { StateField } from "@shared/schema";
import { describe, expect, it } from "vitest";
import {
  autoMapParams,
  buildPresetsForParam,
  getClaimedInputKeys,
  isEnumLike,
  resolveSourceHint,
  resolveSourceLabel,
  toRecord,
} from "../presetUtils";
import type { InputMapRow } from "../presetUtils";

const messagesField: StateField = {
  key: "messages",
  type: "list",
  reducer: "append",
};

const queryField: StateField = {
  key: "query",
  type: "string",
  reducer: "replace",
};

const countField: StateField = {
  key: "count",
  type: "number",
  reducer: "replace",
};

const tagsField: StateField = {
  key: "tags",
  type: "list",
  reducer: "replace",
};

// -- buildPresetsForParam -------------------------------------------------

describe("buildPresetsForParam", () => {
  it("string param shows list fields as [-1].content and string fields", () => {
    const presets = buildPresetsForParam([messagesField, queryField], "string");
    const values = presets.map((p) => p.value);
    expect(values).toContain("messages[-1].content");
    expect(values).toContain("query");
    expect(values).not.toContain("messages"); // raw list hidden
  });

  it("number param shows only number fields", () => {
    const presets = buildPresetsForParam(
      [messagesField, queryField, countField],
      "number",
    );
    const values = presets.map((p) => p.value);
    expect(values).toEqual(["count"]);
  });

  it("undefined param type shows all presets", () => {
    const presets = buildPresetsForParam([
      messagesField,
      queryField,
      countField,
    ]);
    const values = presets.map((p) => p.value);
    expect(values).toContain("messages[-1].content");
    expect(values).toContain("messages"); // raw list visible for custom
    expect(values).toContain("query");
    expect(values).toContain("count");
  });

  it("messages[-1].content has friendly label 'User's message'", () => {
    const presets = buildPresetsForParam([messagesField], "string");
    const p = presets.find((x) => x.value === "messages[-1].content");
    expect(p?.label).toBe("User's message");
  });

  it("messages raw list has label 'Full message history' for undefined paramType", () => {
    const presets = buildPresetsForParam([messagesField]);
    const p = presets.find((x) => x.value === "messages");
    expect(p?.label).toBe("Full message history");
  });

  it("other list [-1].content has label 'Latest {key} entry'", () => {
    const presets = buildPresetsForParam([tagsField], "string");
    const p = presets.find((x) => x.value === "tags[-1].content");
    expect(p?.label).toBe("Latest tags entry");
  });

  it("other list raw has label 'All {key} entries' for undefined paramType", () => {
    const presets = buildPresetsForParam([tagsField]);
    const p = presets.find((x) => x.value === "tags");
    expect(p?.label).toBe("All tags entries");
  });

  it("scalar key label is unchanged", () => {
    const presets = buildPresetsForParam([queryField]);
    const p = presets.find((x) => x.value === "query");
    expect(p?.label).toBe("query");
  });

  it("sets sourceHint when sourceLabels provided", () => {
    const sourceLabels = new Map([["tool_result", ["Search"]]]);
    const toolField = { key: "tool_result", type: "object" };
    const presets = buildPresetsForParam([toolField], undefined, sourceLabels);
    const p = presets.find((x) => x.value === "tool_result");
    expect(p?.label).toBe("tool_result");
    expect(p?.sourceHint).toBe("from Search");
  });

  it("sets sourceHint on list-type field entry", () => {
    const sourceLabels = new Map([["results", ["Search"]]]);
    const listField = { key: "results", type: "list" };
    const presets = buildPresetsForParam([listField], "string", sourceLabels);
    const p = presets.find((x) => x.value === "results[-1].content");
    expect(p?.label).toBe("Latest results entry");
    expect(p?.sourceHint).toBe("from Search");
  });

  it("joins colliding source labels in sourceHint", () => {
    const sourceLabels = new Map([["tool_result", ["Search", "Weather"]]]);
    const toolField = { key: "tool_result", type: "object" };
    const presets = buildPresetsForParam([toolField], undefined, sourceLabels);
    const p = presets.find((x) => x.value === "tool_result");
    expect(p?.sourceHint).toBe("from Search, Weather");
  });

  it("preset value and label unchanged when sourceLabels present", () => {
    const sourceLabels = new Map([["tool_result", ["Search"]]]);
    const toolField = { key: "tool_result", type: "object" };
    const presets = buildPresetsForParam([toolField], undefined, sourceLabels);
    const p = presets.find((x) => x.value === "tool_result");
    expect(p?.value).toBe("tool_result");
    expect(p?.label).toBe("tool_result");
  });

  it("no sourceHint when sourceLabels absent", () => {
    const toolField = { key: "tool_result", type: "object" };
    const presets = buildPresetsForParam([toolField]);
    const p = presets.find((x) => x.value === "tool_result");
    expect(p?.sourceHint).toBeUndefined();
  });

  it("no sourceHint when key not in sourceLabels map", () => {
    const sourceLabels = new Map([["other_key", ["Node"]]]);
    const presets = buildPresetsForParam([queryField], undefined, sourceLabels);
    const p = presets.find((x) => x.value === "query");
    expect(p?.sourceHint).toBeUndefined();
  });
});

// -- isEnumLike -----------------------------------------------------------

describe("isEnumLike", () => {
  it("returns true for 2-5 short examples", () => {
    expect(isEnumLike({ examples: ["now", "format", "parse"] })).toBe(true);
    expect(isEnumLike({ examples: ["a", "b"] })).toBe(true);
    expect(isEnumLike({ examples: ["a", "b", "c", "d", "e"] })).toBe(true);
  });

  it("returns false for 0 or 1 example", () => {
    expect(isEnumLike({ examples: [] })).toBe(false);
    expect(isEnumLike({ examples: ["only"] })).toBe(false);
  });

  it("returns false for more than 5 examples", () => {
    expect(isEnumLike({ examples: ["a", "b", "c", "d", "e", "f"] })).toBe(
      false,
    );
  });

  it("returns false if any example is longer than 20 chars", () => {
    expect(
      isEnumLike({ examples: ["short", "this_is_a_very_long_value_indeed"] }),
    ).toBe(false);
  });

  it("returns false for null or undefined examples", () => {
    expect(isEnumLike({ examples: null })).toBe(false);
    expect(isEnumLike({})).toBe(false);
  });
});

// -- resolveSourceLabel ---------------------------------------------------

describe("resolveSourceLabel", () => {
  it("returns 'your message' for messages[-1].content", () => {
    expect(resolveSourceLabel("messages[-1].content", [])).toBe("your message");
  });

  it("returns 'default (5)' for __default__ with defaultValue", () => {
    expect(resolveSourceLabel("__default__", [], "5")).toBe("default (5)");
  });

  it("returns 'default' for __default__ without defaultValue", () => {
    expect(resolveSourceLabel("__default__", [])).toBe("default");
  });

  it("returns 'user input' for user_input stateKey", () => {
    expect(resolveSourceLabel("user_input", [])).toBe("user input");
  });

  it("returns 'default (now)' for quoted literal '\"now\"'", () => {
    expect(resolveSourceLabel('"now"', [])).toBe("default (now)");
  });

  it("returns the field key for known field keys", () => {
    expect(resolveSourceLabel("query", [queryField])).toBe("query");
  });

  it("returns '⚠ unmapped' for empty string", () => {
    expect(resolveSourceLabel("", [])).toBe("⚠ unmapped");
  });

  it("returns the expression for short custom expressions", () => {
    expect(resolveSourceLabel("some_custom_key", [])).toBe("some_custom_key");
  });

  it("truncates long custom expressions", () => {
    const longExpr = "a".repeat(35);
    const label = resolveSourceLabel(longExpr, []);
    expect(label.length).toBeLessThanOrEqual(30);
    expect(label).toContain("...");
  });
});

// -- resolveSourceHint ----------------------------------------------------

describe("resolveSourceHint", () => {
  it("returns hint for direct key match", () => {
    const sourceLabels = new Map([["query", ["Search"]]]);
    expect(resolveSourceHint("query", sourceLabels)).toBe("from Search");
  });

  it("returns hint for [-1].content expression", () => {
    const sourceLabels = new Map([["results", ["Fetcher"]]]);
    expect(resolveSourceHint("results[-1].content", sourceLabels)).toBe(
      "from Fetcher",
    );
  });

  it("joins multiple source labels", () => {
    const sourceLabels = new Map([["data", ["Search", "Weather"]]]);
    expect(resolveSourceHint("data", sourceLabels)).toBe(
      "from Search, Weather",
    );
  });

  it("returns undefined for user_input", () => {
    const sourceLabels = new Map([["user_input", ["Start"]]]);
    expect(resolveSourceHint("user_input", sourceLabels)).toBeUndefined();
  });

  it("returns undefined for messages[-1].content", () => {
    const sourceLabels = new Map([["messages", ["Node"]]]);
    expect(
      resolveSourceHint("messages[-1].content", sourceLabels),
    ).toBeUndefined();
  });

  it("returns undefined for __default__", () => {
    const sourceLabels = new Map([["__default__", ["Node"]]]);
    expect(resolveSourceHint("__default__", sourceLabels)).toBeUndefined();
  });

  it("returns undefined for quoted literal", () => {
    const sourceLabels = new Map([["now", ["Node"]]]);
    expect(resolveSourceHint('"now"', sourceLabels)).toBeUndefined();
  });

  it("returns undefined when key not in map", () => {
    const sourceLabels = new Map([["other", ["Node"]]]);
    expect(resolveSourceHint("query", sourceLabels)).toBeUndefined();
  });

  it("returns undefined for empty stateKey", () => {
    const sourceLabels = new Map([["", ["Node"]]]);
    expect(resolveSourceHint("", sourceLabels)).toBeUndefined();
  });
});

// -- autoMapParams --------------------------------------------------------

describe("autoMapParams", () => {
  it("prefers exact name match over type fallback", () => {
    // query field exists and is compatible with string param
    const result = autoMapParams(
      [
        {
          name: "query",
          type: "string",
          required: true,
          description: "Search query",
        },
      ],
      [messagesField, queryField],
    );
    expect(result.map.query).toBe("query");
    expect(result.newFields).toHaveLength(0);
  });

  it("maps first required non-enum string param to user_input", () => {
    const result = autoMapParams(
      [{ name: "url", type: "string", required: true, description: "URL" }],
      [messagesField],
    );
    expect(result.map.url).toBe("user_input");
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0]).toMatchObject({
      key: "user_input",
      type: "string",
      reducer: "replace",
    });
  });

  it("skips enum-like params for user_input", () => {
    const result = autoMapParams(
      [
        {
          name: "action",
          type: "string",
          required: true,
          description: "Action",
          examples: ["now", "format", "parse"],
        },
      ],
      [messagesField],
    );
    expect(result.map.action).not.toBe("user_input");
  });

  it("enum-like required param with no default gets quoted literal", () => {
    const result = autoMapParams(
      [
        {
          name: "action",
          type: "string",
          required: true,
          description: "Action",
          examples: ["now", "format", "parse"],
        },
      ],
      [],
    );
    expect(result.map.action).toBe('"now"');
  });

  it("quoted literal survives toRecord", () => {
    const rows: InputMapRow[] = [
      {
        param: "action",
        stateKey: '"now"',
        isAutoFilled: true,
        customMode: false,
      },
    ];
    expect(toRecord(rows)).toEqual({ action: '"now"' });
  });

  it("falls back to first optional non-enum string when no required string params", () => {
    const result = autoMapParams(
      [
        {
          name: "query",
          type: "string",
          required: false,
          description: "Search query",
        },
        {
          name: "action",
          type: "string",
          required: false,
          description: "Action",
          examples: ["search", "summary"],
          default: "search",
        },
      ],
      [],
    );
    expect(result.map.query).toBe("user_input");
    expect(result.map.action).toBe("__default__");
  });

  it("prefers required over optional for user_input", () => {
    const result = autoMapParams(
      [
        {
          name: "opt_query",
          type: "string",
          required: false,
          description: "Optional query",
        },
        {
          name: "req_path",
          type: "string",
          required: true,
          description: "Required path",
        },
      ],
      [],
    );
    expect(result.map.req_path).toBe("user_input");
    expect(result.map.opt_query).not.toBe("user_input");
  });

  it("reuses existing user_input field instead of creating duplicate", () => {
    const userInputField: StateField = {
      key: "user_input",
      type: "string",
      reducer: "replace",
    };
    const result = autoMapParams(
      [{ name: "url", type: "string", required: true, description: "URL" }],
      [userInputField],
    );
    expect(result.map.url).toBe("user_input");
    expect(result.newFields).toHaveLength(0);
  });

  it("does not create user_input when exact match exists", () => {
    const result = autoMapParams(
      [
        {
          name: "query",
          type: "string",
          required: true,
          description: "Search query",
        },
      ],
      [queryField],
    );
    expect(result.map.query).toBe("query");
    expect(result.newFields).toHaveLength(0);
  });

  it("uses __default__ for optional params with defaults", () => {
    const result = autoMapParams(
      [
        {
          name: "max_results",
          type: "number",
          required: false,
          description: "Max results",
          default: "5",
        },
      ],
      [messagesField],
    );
    expect(result.map.max_results).toBe("__default__");
    expect(result.newFields).toHaveLength(0);
  });

  it("auto-creates state fields for required params with no compatible state field", () => {
    const result = autoMapParams(
      [
        {
          name: "timeout",
          type: "number",
          required: true,
          description: "Timeout",
        },
      ],
      [messagesField],
    );
    expect(result.map.timeout).toBe("timeout");
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0]).toMatchObject({
      key: "timeout",
      type: "number",
      reducer: "replace",
    });
  });

  it("returns '' for required params with name collision on incompatible field", () => {
    // "count" exists as a string field but param expects number
    const stringCountField: StateField = {
      key: "count",
      type: "string",
      reducer: "replace",
    };
    const result = autoMapParams(
      [{ name: "count", type: "number", required: true, description: "Count" }],
      [stringCountField],
    );
    expect(result.map.count).toBe("");
    expect(result.newFields).toHaveLength(0);
  });

  it("first param gets user_input, second required string auto-creates", () => {
    const result = autoMapParams(
      [
        {
          name: "path",
          type: "string",
          required: true,
          description: "File path",
        },
        {
          name: "content",
          type: "string",
          required: true,
          description: "Content",
        },
      ],
      [],
    );
    expect(result.map.path).toBe("user_input");
    expect(result.map.content).toBe("content");
    expect(result.newFields).toHaveLength(2);
    expect(result.newFields.map((f) => f.key)).toContain("user_input");
    expect(result.newFields.map((f) => f.key)).toContain("content");
  });

  it("optional param with incompatible name collision uses __default__", () => {
    const stringCountField: StateField = {
      key: "count",
      type: "string",
      reducer: "replace",
    };
    const result = autoMapParams(
      [
        {
          name: "count",
          type: "number",
          required: false,
          description: "Count",
          default: "10",
        },
      ],
      [stringCountField],
    );
    expect(result.map.count).toBe("__default__");
  });

  it("file_write: path gets user_input, content auto-created, mode gets __default__", () => {
    const result = autoMapParams(
      [
        {
          name: "path",
          type: "string",
          required: true,
          description: "File path",
        },
        {
          name: "content",
          type: "string",
          required: true,
          description: "Content to write",
        },
        {
          name: "mode",
          type: "string",
          required: false,
          description: "Write mode",
          default: "overwrite",
          examples: ["overwrite", "append"],
        },
      ],
      [],
    );
    expect(result.map.path).toBe("user_input");
    expect(result.map.content).toBe("content");
    expect(result.map.mode).toBe("__default__");
    expect(result.newFields.map((f) => f.key)).toContain("user_input");
    expect(result.newFields.map((f) => f.key)).toContain("content");
  });

  it("datetime full mapping: enum action gets quoted literal, others unmapped", () => {
    // datetime has a required enum-like string (action) — no required non-enum string
    // and since a required string param exists, optional fallback is NOT used
    const result = autoMapParams(
      [
        {
          name: "action",
          type: "string",
          required: true,
          description: "Action to perform",
          examples: ["now", "format", "parse"],
        },
        {
          name: "date",
          type: "string",
          required: false,
          description: "Date string",
        },
        {
          name: "fmt",
          type: "string",
          required: false,
          description: "Format string",
        },
      ],
      [],
    );
    expect(result.map.action).toBe('"now"');
    expect(result.map.date).toBe("");
    expect(result.map.fmt).toBe("");
    expect(result.newFields).toHaveLength(0);
  });

  it("wikipedia full mapping: query gets user_input, action gets __default__, title unmapped", () => {
    // wikipedia has no required string params → optional fallback runs
    const result = autoMapParams(
      [
        {
          name: "query",
          type: "string",
          required: false,
          description: "Search query",
        },
        {
          name: "action",
          type: "string",
          required: false,
          description: "Action",
          default: "search",
          examples: ["search", "summary"],
        },
        {
          name: "title",
          type: "string",
          required: false,
          description: "Article title",
        },
      ],
      [],
    );
    expect(result.map.query).toBe("user_input");
    expect(result.map.action).toBe("__default__");
    expect(result.map.title).toBe("");
  });
});

// -- toRecord -------------------------------------------------------------

describe("toRecord", () => {
  it("excludes __default__ rows", () => {
    const rows: InputMapRow[] = [
      {
        param: "max_results",
        stateKey: "__default__",
        isAutoFilled: true,
        customMode: false,
      },
    ];
    expect(toRecord(rows)).toEqual({});
  });

  it("keeps rows with valid stateKey", () => {
    const rows: InputMapRow[] = [
      {
        param: "query",
        stateKey: "messages[-1].content",
        isAutoFilled: true,
        customMode: false,
      },
    ];
    expect(toRecord(rows)).toEqual({ query: "messages[-1].content" });
  });

  it("keeps rows with empty stateKey (unmapped)", () => {
    const rows: InputMapRow[] = [
      { param: "url", stateKey: "", isAutoFilled: true, customMode: false },
    ];
    expect(toRecord(rows)).toEqual({ url: "" });
  });

  it("skips rows with empty param name", () => {
    const rows: InputMapRow[] = [
      {
        param: "",
        stateKey: "messages",
        isAutoFilled: false,
        customMode: false,
      },
    ];
    expect(toRecord(rows)).toEqual({});
  });

  it("keeps quoted literal stateKeys (not stripped like __default__)", () => {
    const rows: InputMapRow[] = [
      {
        param: "action",
        stateKey: '"now"',
        isAutoFilled: true,
        customMode: false,
      },
    ];
    expect(toRecord(rows)).toEqual({ action: '"now"' });
  });
});

// -- getClaimedInputKeys --------------------------------------------------

describe("getClaimedInputKeys", () => {
  const makeNode = (
    id: string,
    type: string,
    inputMap: Record<string, string> = {},
  ) => ({
    id,
    type,
    config: { input_map: inputMap },
  });

  it("returns user_input when another tool maps to it", () => {
    const nodes = [
      makeNode("t1", "tool", { query: "user_input" }),
      makeNode("t2", "tool", {}),
    ];
    expect(getClaimedInputKeys(nodes, "t2")).toEqual(new Set(["user_input"]));
  });

  it("excludes the current node's own mappings", () => {
    const nodes = [makeNode("t1", "tool", { query: "user_input" })];
    expect(getClaimedInputKeys(nodes, "t1")).toEqual(new Set());
  });

  it("ignores __default__ and quoted literal values", () => {
    const nodes = [
      makeNode("t1", "tool", { action: "__default__", mode: '"now"' }),
    ];
    expect(getClaimedInputKeys(nodes, "t2")).toEqual(new Set());
  });

  it("handles bracket expressions: messages[-1].content → claims messages", () => {
    const nodes = [
      makeNode("llm1", "llm", { context: "messages[-1].content" }),
    ];
    expect(getClaimedInputKeys(nodes, "t1")).toEqual(new Set(["messages"]));
  });

  it("returns empty set when no other tool/llm nodes exist", () => {
    const nodes = [makeNode("start", "start", {})];
    expect(getClaimedInputKeys(nodes, "t1")).toEqual(new Set());
  });
});

// -- autoMapParams with claimedInputKeys ----------------------------------

describe("autoMapParams with claimedInputKeys", () => {
  it("maps to {param_name}_input when user_input is claimed", () => {
    const claimed = new Set(["user_input"]);
    const result = autoMapParams(
      [{ name: "url", type: "string", required: true, description: "URL" }],
      [messagesField],
      claimed,
    );
    expect(result.map.url).toBe("url_input");
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0]).toMatchObject({
      key: "url_input",
      type: "string",
    });
  });

  it("original behavior without claimedInputKeys", () => {
    const result = autoMapParams(
      [{ name: "url", type: "string", required: true, description: "URL" }],
      [messagesField],
    );
    expect(result.map.url).toBe("user_input");
  });

  it("deduplicates when {param_name}_input already exists in stateFields", () => {
    const urlInputField: StateField = {
      key: "url_input",
      type: "string",
      reducer: "replace",
    };
    const claimed = new Set(["user_input"]);
    const result = autoMapParams(
      [{ name: "url", type: "string", required: true, description: "URL" }],
      [messagesField, urlInputField],
      claimed,
    );
    expect(result.map.url).toBe("url_input_2");
    expect(result.newFields.find((f) => f.key === "url_input_2")).toBeDefined();
  });
});
