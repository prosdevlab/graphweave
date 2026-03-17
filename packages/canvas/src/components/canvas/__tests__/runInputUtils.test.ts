import type { NodeSchema, StateField } from "@shared/schema";
import { describe, expect, it } from "vitest";
import {
  buildFieldHints,
  buildFormValues,
  buildScaffold,
  classifyFields,
  extractRootKey,
  formValuesToInput,
  inputToFormValues,
  isMessagesField,
} from "../runInputUtils";

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

const enabledField: StateField = {
  key: "enabled",
  type: "boolean",
  reducer: "replace",
};

const tagsField: StateField = {
  key: "tags",
  type: "list",
  reducer: "replace",
};

const metaField: StateField = {
  key: "meta",
  type: "object",
  reducer: "merge",
};

const toolResultField: StateField = {
  key: "tool_result",
  type: "string",
  reducer: "replace",
};

describe("classifyFields", () => {
  it("returns all state fields as input when no output nodes", () => {
    const state = [messagesField, queryField];
    const { inputFields, outputKeys } = classifyFields(state, []);
    expect(inputFields).toEqual([messagesField, queryField]);
    expect(outputKeys.size).toBe(0);
  });

  it("excludes fields that are output_key of LLM or tool nodes", () => {
    const state = [messagesField, toolResultField];
    const nodes: NodeSchema[] = [
      {
        id: "n1",
        type: "tool",
        label: "Tool",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "calculator",
          input_map: {},
          output_key: "tool_result",
        },
      },
    ];
    const { inputFields, outputKeys } = classifyFields(state, nodes);
    expect(inputFields).toEqual([messagesField]);
    expect(outputKeys).toContain("tool_result");
  });

  it("collects output_key from LLM nodes", () => {
    const llmResultField: StateField = {
      key: "llm_result",
      type: "string",
      reducer: "replace",
    };
    const state = [messagesField, llmResultField];
    const nodes: NodeSchema[] = [
      {
        id: "n1",
        type: "llm",
        label: "LLM",
        position: { x: 0, y: 0 },
        config: {
          provider: "openai",
          model: "gpt-4o",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: {},
          output_key: "llm_result",
        },
      },
    ];
    const { inputFields, outputKeys } = classifyFields(state, nodes);
    expect(inputFields).toEqual([messagesField]);
    expect(outputKeys).toContain("llm_result");
  });

  it("ignores non-llm/tool nodes for output classification", () => {
    const state = [messagesField, queryField];
    const nodes: NodeSchema[] = [
      {
        id: "start",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "end",
        type: "end",
        label: "End",
        position: { x: 0, y: 0 },
        config: {},
      },
    ];
    const { inputFields, outputKeys } = classifyFields(state, nodes);
    expect(inputFields).toEqual([messagesField, queryField]);
    expect(outputKeys.size).toBe(0);
  });
});

describe("isMessagesField", () => {
  it("returns true for messages list+append field", () => {
    expect(isMessagesField(messagesField)).toBe(true);
  });

  it("returns false when key is not messages", () => {
    expect(
      isMessagesField({ key: "items", type: "list", reducer: "append" }),
    ).toBe(false);
  });

  it("returns false when type is not list", () => {
    expect(
      isMessagesField({ key: "messages", type: "string", reducer: "append" }),
    ).toBe(false);
  });

  it("returns false when reducer is not append", () => {
    expect(
      isMessagesField({ key: "messages", type: "list", reducer: "replace" }),
    ).toBe(false);
  });
});

describe("buildFormValues", () => {
  it("returns empty string for string fields", () => {
    expect(buildFormValues([queryField])).toEqual({ query: "" });
  });

  it("returns 0 for number fields", () => {
    expect(buildFormValues([countField])).toEqual({ count: 0 });
  });

  it("returns false for boolean fields", () => {
    expect(buildFormValues([enabledField])).toEqual({ enabled: false });
  });

  it("returns empty array for list fields", () => {
    expect(buildFormValues([tagsField])).toEqual({ tags: [] });
  });

  it("returns empty object for object fields", () => {
    expect(buildFormValues([metaField])).toEqual({ meta: {} });
  });

  it("returns empty string for messages field", () => {
    expect(buildFormValues([messagesField])).toEqual({ messages: "" });
  });
});

describe("formValuesToInput", () => {
  it("wraps non-empty messages string to [{role,content}]", () => {
    const result = formValuesToInput({ messages: "hello world" }, [
      messagesField,
    ]);
    expect(result).toEqual({
      messages: [{ role: "user", content: "hello world" }],
    });
  });

  it("omits empty messages string", () => {
    const result = formValuesToInput({ messages: "" }, [messagesField]);
    expect(result).toEqual({});
  });

  it("omits empty string fields", () => {
    expect(formValuesToInput({ query: "" }, [queryField])).toEqual({});
  });

  it("passes through non-empty string fields", () => {
    expect(formValuesToInput({ query: "test" }, [queryField])).toEqual({
      query: "test",
    });
  });

  it("omits zero number fields", () => {
    expect(formValuesToInput({ count: 0 }, [countField])).toEqual({});
  });

  it("passes through non-zero number fields", () => {
    expect(formValuesToInput({ count: 5 }, [countField])).toEqual({ count: 5 });
  });

  it("omits false boolean fields", () => {
    expect(formValuesToInput({ enabled: false }, [enabledField])).toEqual({});
  });

  it("passes through true boolean fields", () => {
    expect(formValuesToInput({ enabled: true }, [enabledField])).toEqual({
      enabled: true,
    });
  });

  it("omits empty list fields", () => {
    expect(formValuesToInput({ tags: [] }, [tagsField])).toEqual({});
  });

  it("passes through non-empty list fields", () => {
    expect(formValuesToInput({ tags: ["a", "b"] }, [tagsField])).toEqual({
      tags: ["a", "b"],
    });
  });

  it("omits empty object fields", () => {
    expect(formValuesToInput({ meta: {} }, [metaField])).toEqual({});
  });

  it("passes through non-empty object fields", () => {
    expect(formValuesToInput({ meta: { x: 1 } }, [metaField])).toEqual({
      meta: { x: 1 },
    });
  });

  it("trims whitespace from messages before wrapping", () => {
    const result = formValuesToInput({ messages: "  hi  " }, [messagesField]);
    expect(result).toEqual({
      messages: [{ role: "user", content: "hi" }],
    });
  });
});

describe("inputToFormValues", () => {
  it("unwraps messages array to content string", () => {
    const input = {
      messages: [{ role: "user", content: "hello" }],
    };
    const result = inputToFormValues(input, [messagesField]);
    expect(result.messages).toBe("hello");
  });

  it("returns empty string for messages when array is empty", () => {
    const result = inputToFormValues({ messages: [] }, [messagesField]);
    expect(result.messages).toBe("");
  });

  it("passes through string values", () => {
    const result = inputToFormValues({ query: "test" }, [queryField]);
    expect(result.query).toBe("test");
  });

  it("uses defaults for missing fields", () => {
    const result = inputToFormValues({}, [queryField, countField]);
    expect(result.query).toBe("");
    expect(result.count).toBe(0);
  });

  it("passes through number values", () => {
    const result = inputToFormValues({ count: 42 }, [countField]);
    expect(result.count).toBe(42);
  });
});

describe("formValuesToInput + inputToFormValues round-trip", () => {
  it("round-trips messages field", () => {
    const original = { messages: "test message" };
    const input = formValuesToInput(original, [messagesField]);
    const restored = inputToFormValues(input, [messagesField]);
    expect(restored.messages).toBe("test message");
  });

  it("round-trips string field", () => {
    const original = { query: "search term" };
    const input = formValuesToInput(original, [queryField]);
    const restored = inputToFormValues(input, [queryField]);
    expect(restored.query).toBe("search term");
  });

  it("round-trips empty form (all omitted)", () => {
    const original = buildFormValues([queryField, countField, enabledField]);
    const input = formValuesToInput(original, [
      queryField,
      countField,
      enabledField,
    ]);
    expect(input).toEqual({});
    const restored = inputToFormValues(input, [
      queryField,
      countField,
      enabledField,
    ]);
    expect(restored).toEqual(original);
  });
});

describe("buildScaffold", () => {
  it("generates messages scaffold with role/content", () => {
    const scaffold = buildScaffold([messagesField]);
    expect(scaffold).toEqual({
      messages: [{ role: "user", content: "" }],
    });
  });

  it("generates string scaffold", () => {
    expect(buildScaffold([queryField])).toEqual({ query: "" });
  });

  it("generates number scaffold", () => {
    expect(buildScaffold([countField])).toEqual({ count: 0 });
  });

  it("generates boolean scaffold", () => {
    expect(buildScaffold([enabledField])).toEqual({ enabled: false });
  });

  it("generates list scaffold", () => {
    expect(buildScaffold([tagsField])).toEqual({ tags: [] });
  });

  it("generates object scaffold", () => {
    expect(buildScaffold([metaField])).toEqual({ meta: {} });
  });

  it("omits output fields (only processes inputFields)", () => {
    // buildScaffold takes only input fields, so output fields shouldn't appear
    const scaffold = buildScaffold([queryField]);
    expect(Object.keys(scaffold)).toEqual(["query"]);
  });
});

// -- extractRootKey -------------------------------------------------------

describe("extractRootKey", () => {
  it("returns simple key unchanged", () => {
    expect(extractRootKey("url")).toBe("url");
  });

  it("extracts root from bracket notation", () => {
    expect(extractRootKey("messages[0].content")).toBe("messages");
  });

  it("extracts root from dot notation", () => {
    expect(extractRootKey("data.nested")).toBe("data");
  });

  it("returns empty string for empty input", () => {
    expect(extractRootKey("")).toBe("");
  });
});

// -- buildFieldHints ------------------------------------------------------

const toolFixtures = [
  {
    name: "url_fetch",
    parameters: [
      {
        name: "url",
        description: "URL to fetch",
        default: null,
        examples: ["https://example.com"],
      },
    ],
  },
  {
    name: "web_search",
    parameters: [
      {
        name: "query",
        description: "Search query",
        default: null,
        examples: ["latest AI news"],
      },
      {
        name: "max_results",
        description: "Maximum number of results",
        default: "5",
        examples: null,
      },
    ],
  },
];

describe("buildFieldHints", () => {
  it("tool node maps param metadata to state field", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Fetch",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "url_fetch",
          input_map: { url: "url" },
          output_key: "result",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(hints.url).toHaveLength(1);
    expect(hints.url?.[0]?.description).toBe("URL to fetch");
    expect(hints.url?.[0]?.source).toBe("Fetch (url_fetch)");
    expect(hints.url?.[0]?.examples).toEqual(["https://example.com"]);
  });

  it("LLM node produces hint with model name as source", () => {
    const nodes: NodeSchema[] = [
      {
        id: "l1",
        type: "llm",
        label: "Summarizer",
        position: { x: 0, y: 0 },
        config: {
          provider: "openai",
          model: "gpt-4o",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: { messages: "messages" },
          output_key: "summary",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(hints.messages).toHaveLength(1);
    expect(hints.messages?.[0]?.source).toBe("Summarizer (gpt-4o)");
  });

  it("node with empty input_map produces no hints", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Tool",
        position: { x: 0, y: 0 },
        config: { tool_name: "url_fetch", input_map: {}, output_key: "r" },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(Object.keys(hints)).toHaveLength(0);
  });

  it("two tool nodes mapping to same state key produce two hints", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Fetch1",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "url_fetch",
          input_map: { url: "url" },
          output_key: "r1",
        },
      },
      {
        id: "t2",
        type: "tool",
        label: "Fetch2",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "url_fetch",
          input_map: { url: "url" },
          output_key: "r2",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(hints.url).toHaveLength(2);
  });

  it("expression mapping messages[0].content attaches hint to messages", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Search",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "web_search",
          input_map: { query: "messages[0].content" },
          output_key: "r",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(hints.messages).toHaveLength(1);
    expect(hints.messages?.[0]?.description).toBe("Search query");
  });

  it("start/end/condition nodes are skipped (no crash)", () => {
    const nodes: NodeSchema[] = [
      {
        id: "s",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "e",
        type: "end",
        label: "End",
        position: { x: 0, y: 0 },
        config: {},
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(Object.keys(hints)).toHaveLength(0);
  });

  it("empty tools array returns empty hints (no crash)", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Tool",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "url_fetch",
          input_map: { url: "url" },
          output_key: "r",
        },
      },
    ];
    const hints = buildFieldHints(nodes, []);
    // Falls back to paramName as description
    expect(hints.url).toHaveLength(1);
    expect(hints.url?.[0]?.description).toBe("url");
  });

  it("empty stateExpr in input_map is skipped", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Tool",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "url_fetch",
          input_map: { url: "" },
          output_key: "r",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(Object.keys(hints)).toHaveLength(0);
  });

  it("tool not in tools lookup falls back to paramName", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Custom",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "unknown_tool",
          input_map: { data: "data" },
          output_key: "r",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(hints.data?.[0]?.description).toBe("data");
    expect(hints.data?.[0]?.source).toBe("Custom (unknown_tool)");
  });

  it("tool node with tool_name empty string is skipped", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Tool",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "",
          input_map: { url: "url" },
          output_key: "r",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(Object.keys(hints)).toHaveLength(0);
  });

  it("source includes node label", () => {
    const nodes: NodeSchema[] = [
      {
        id: "t1",
        type: "tool",
        label: "Fetch",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "url_fetch",
          input_map: { url: "url" },
          output_key: "r",
        },
      },
    ];
    const hints = buildFieldHints(nodes, toolFixtures);
    expect(hints.url?.[0]?.source).toContain("Fetch");
  });
});

// -- formValuesToInput with prefilledKeys ---------------------------------

describe("formValuesToInput with prefilledKeys", () => {
  it("pre-filled field set to 0 is NOT omitted when in prefilledKeys", () => {
    const result = formValuesToInput(
      { count: 0 },
      [countField],
      new Set(["count"]),
    );
    expect(result).toEqual({ count: 0 });
  });

  it("non-pre-filled field set to 0 IS still omitted", () => {
    const result = formValuesToInput({ count: 0 }, [countField]);
    expect(result).toEqual({});
  });

  it("pre-filled string field set to empty is NOT omitted", () => {
    const result = formValuesToInput(
      { query: "" },
      [queryField],
      new Set(["query"]),
    );
    expect(result).toEqual({ query: "" });
  });
});
