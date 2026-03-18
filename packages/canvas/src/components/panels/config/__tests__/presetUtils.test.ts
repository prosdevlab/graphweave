import type { StateField } from "@shared/schema";
import { describe, expect, it } from "vitest";
import {
  autoMapParams,
  buildPresetsForParam,
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

  it("uses messages[-1].content fallback for first unmatched string param", () => {
    const result = autoMapParams(
      [{ name: "url", type: "string", required: true, description: "URL" }],
      [messagesField],
    );
    expect(result.map.url).toBe("messages[-1].content");
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

  it("second unmatched string param auto-creates after messages is taken", () => {
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
      [messagesField],
    );
    expect(result.map.path).toBe("messages[-1].content");
    expect(result.map.content).toBe("content");
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0]?.key).toBe("content");
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
});
