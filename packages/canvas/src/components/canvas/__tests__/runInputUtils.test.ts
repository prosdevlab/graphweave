import type { NodeSchema, StateField } from "@shared/schema";
import { describe, expect, it } from "vitest";
import {
  buildFieldHints,
  buildFormValues,
  buildScaffold,
  classifyFields,
  extractRootKey,
  formValuesToInput,
  getConsumedInputFields,
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

  it("excludes replace-reducer fields that are output_key of tool nodes", () => {
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
    // tool_result has reducer "replace" → excluded from inputFields
    expect(inputFields).toEqual([messagesField]);
    expect(outputKeys).toContain("tool_result");
  });

  it("keeps merge-reducer fields in inputFields even when a node writes to them", () => {
    const mergeOutputField: StateField = {
      key: "meta",
      type: "object",
      reducer: "merge",
    };
    const state = [messagesField, mergeOutputField];
    const nodes: NodeSchema[] = [
      {
        id: "n1",
        type: "tool",
        label: "Tool",
        position: { x: 0, y: 0 },
        config: { tool_name: "enricher", input_map: {}, output_key: "meta" },
      },
    ];
    const { inputFields, outputKeys } = classifyFields(state, nodes);
    expect(inputFields).toContainEqual(mergeOutputField);
    expect(outputKeys).toContain("meta");
  });

  it("keeps append-reducer fields in inputFields even when a node writes to them", () => {
    // messages reducer is "append" — multiple contributors allowed
    const state = [messagesField, toolResultField];
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
          output_key: "messages",
        },
      },
    ];
    const { inputFields, outputKeys } = classifyFields(state, nodes);
    expect(inputFields).toContainEqual(messagesField);
    expect(outputKeys).toContain("messages");
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

  it("LLM with output_key llm_response — messages stays in inputFields, llm_response excluded", () => {
    const llmResponseField: StateField = {
      key: "llm_response",
      type: "string",
      reducer: "replace",
    };
    const state = [messagesField, llmResponseField];
    const nodes: NodeSchema[] = [
      {
        id: "n1",
        type: "llm",
        label: "LLM",
        position: { x: 0, y: 0 },
        config: {
          provider: "gemini",
          model: "gemini-2.0-flash",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: {},
          output_key: "llm_response",
        },
      },
    ];
    const { inputFields, outputKeys } = classifyFields(state, nodes);
    expect(inputFields).toContainEqual(messagesField);
    expect(inputFields).not.toContainEqual(llmResponseField);
    expect(outputKeys).toContain("llm_response");
  });

  it("returns outputKeyWriters mapping output_key to node label", () => {
    const state = [messagesField, toolResultField];
    const nodes: NodeSchema[] = [
      {
        id: "n1",
        type: "tool",
        label: "Search",
        position: { x: 0, y: 0 },
        config: {
          tool_name: "web_search",
          input_map: {},
          output_key: "tool_result",
        },
      },
    ];
    const { outputKeyWriters } = classifyFields(state, nodes);
    expect(outputKeyWriters).toEqual({ tool_result: "Search" });
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

// -- getConsumedInputFields -----------------------------------------------

const userInputField: StateField = {
  key: "user_input",
  type: "string",
  reducer: "replace",
};

const contentField: StateField = {
  key: "content",
  type: "string",
  reducer: "replace",
};

describe("getConsumedInputFields", () => {
  describe("core tool scenarios", () => {
    it("calculator: all defaults → no consumed fields (skip dialog)", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Calculator",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "calculator",
            input_map: { expression: '"2 + 2"' },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [messagesField, toolResultField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([]);
    });

    it("calculator: user_input → shows user_input field", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Calculator",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "calculator",
            input_map: { expression: "user_input" },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [
        messagesField,
        userInputField,
        toolResultField,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([userInputField]);
    });

    it("url_fetch: user_input consumed", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Fetch",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "url_fetch",
            input_map: { url: "user_input" },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [
        messagesField,
        userInputField,
        toolResultField,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([userInputField]);
    });

    it("datetime: only quoted literals → no consumed fields (skip dialog)", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "DateTime",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "datetime",
            input_map: { action: '"now"' },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [messagesField, toolResultField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([]);
    });

    it("file_write: user_input + content → both consumed", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "FileWrite",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "file_write",
            input_map: { path: "user_input", content: "content" },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [
        messagesField,
        userInputField,
        contentField,
        toolResultField,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toContainEqual(userInputField);
      expect(consumedFields).toContainEqual(contentField);
      expect(consumedFields).not.toContainEqual(messagesField);
    });

    it("web_search: user_input consumed, __default__ stripped", () => {
      // __default__ is stripped by toRecord and never appears in persisted input_map
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "WebSearch",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "web_search",
            input_map: { query: "user_input" },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [
        messagesField,
        userInputField,
        toolResultField,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([userInputField]);
    });

    it("wikipedia: user_input consumed for optional query", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Wikipedia",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "wikipedia",
            input_map: { query: "user_input" },
            output_key: "tool_result",
          },
        },
      ];
      const state: StateField[] = [
        messagesField,
        userInputField,
        toolResultField,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([userInputField]);
    });
  });

  describe("LLM node scenarios", () => {
    it("LLM with empty input_map implicitly consumes messages", () => {
      const resultField: StateField = {
        key: "result",
        type: "string",
        reducer: "replace",
      };
      const nodes: NodeSchema[] = [
        {
          id: "l1",
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
            output_key: "result",
          },
        },
      ];
      const state: StateField[] = [messagesField, resultField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([messagesField]);
    });

    it("LLM with explicit input_map { messages: 'messages' } consumes messages", () => {
      const summaryField: StateField = {
        key: "summary",
        type: "string",
        reducer: "replace",
      };
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
      const state: StateField[] = [messagesField, summaryField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([messagesField]);
    });

    it("LLM with output_key llm_response and empty input_map → messages in consumedFields", () => {
      const llmResponseField: StateField = {
        key: "llm_response",
        type: "string",
        reducer: "replace",
      };
      const nodes: NodeSchema[] = [
        {
          id: "l1",
          type: "llm",
          label: "LLM",
          position: { x: 0, y: 0 },
          config: {
            provider: "gemini",
            model: "gemini-2.0-flash",
            system_prompt: "",
            temperature: 0.7,
            max_tokens: 1024,
            input_map: {},
            output_key: "llm_response",
          },
        },
      ];
      const state: StateField[] = [messagesField, llmResponseField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      // messages consumed (LLM implicit read), llm_response excluded (replace output)
      expect(consumedFields).toEqual([messagesField]);
    });

    it("LLM with output_key 'messages' → messages stays as input (append reducer)", () => {
      // `messages` has reducer: "append" — a node writing to it does not
      // prevent the user from providing the initial message. classifyFields
      // only excludes replace-reducer fields from inputFields.
      const nodes: NodeSchema[] = [
        {
          id: "l1",
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
            output_key: "messages",
          },
        },
      ];
      const state: StateField[] = [messagesField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      // LLM's empty input_map implicitly consumes messages; messages stays
      // in inputFields because its reducer is "append", not "replace".
      expect(consumedFields).toEqual([messagesField]);
    });
  });

  describe("multi-node scenarios", () => {
    it("tool + LLM → union of consumed fields", () => {
      const summaryField: StateField = {
        key: "summary",
        type: "string",
        reducer: "replace",
      };
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Fetch",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "url_fetch",
            input_map: { url: "user_input" },
            output_key: "tool_result",
          },
        },
        {
          id: "l1",
          type: "llm",
          label: "LLM",
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
      const state: StateField[] = [
        messagesField,
        userInputField,
        toolResultField,
        summaryField,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toContainEqual(messagesField);
      expect(consumedFields).toContainEqual(userInputField);
    });

    it("two tools sharing same input field → field appears once", () => {
      const r1Field: StateField = {
        key: "r1",
        type: "string",
        reducer: "replace",
      };
      const r2Field: StateField = {
        key: "r2",
        type: "string",
        reducer: "replace",
      };
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Fetch",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "url_fetch",
            input_map: { url: "user_input" },
            output_key: "r1",
          },
        },
        {
          id: "t2",
          type: "tool",
          label: "Search",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "web_search",
            input_map: { query: "user_input" },
            output_key: "r2",
          },
        },
      ];
      const state: StateField[] = [
        messagesField,
        userInputField,
        r1Field,
        r2Field,
      ];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([userInputField]);
    });
  });

  describe("edge cases", () => {
    it("empty state → no consumed fields", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Fetch",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "url_fetch",
            input_map: { url: "user_input" },
            output_key: "r",
          },
        },
      ];
      const { consumedFields } = getConsumedInputFields([], nodes);
      expect(consumedFields).toEqual([]);
    });

    it("no nodes → no consumed fields", () => {
      const state: StateField[] = [messagesField, queryField];
      const { consumedFields } = getConsumedInputFields(state, []);
      expect(consumedFields).toEqual([]);
    });

    it("start/end nodes don't contribute consumed keys", () => {
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
      const state: StateField[] = [messagesField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([]);
    });

    it("excludes output fields even if referenced in input_map", () => {
      // tool1 writes tool_result; tool2 reads tool_result from input_map
      // tool_result is in outputKeys → not in inputFields → not in consumedFields
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Tool1",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "url_fetch",
            input_map: { url: "user_input" },
            output_key: "tool_result",
          },
        },
        {
          id: "t2",
          type: "tool",
          label: "Tool2",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "web_search",
            input_map: { query: "tool_result" },
            output_key: "r2",
          },
        },
      ];
      const r2Field: StateField = {
        key: "r2",
        type: "string",
        reducer: "replace",
      };
      const state: StateField[] = [toolResultField, r2Field];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).not.toContainEqual(toolResultField);
    });

    it("quoted literal extractRootKey returns quoted key (no state match)", () => {
      // Critical path: quoted literals must NOT match any state field key
      expect(extractRootKey('"now"')).toBe('"now"');
    });

    it("tool with empty input_map → no consumed fields", () => {
      const nodes: NodeSchema[] = [
        {
          id: "t1",
          type: "tool",
          label: "Tool",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "url_fetch",
            input_map: {},
            output_key: "r",
          },
        },
      ];
      const state: StateField[] = [messagesField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([]);
    });

    it("condition node does not contribute consumed keys", () => {
      const statusField: StateField = {
        key: "status",
        type: "string",
        reducer: "replace",
      };
      const nodes: NodeSchema[] = [
        {
          id: "c1",
          type: "condition",
          label: "Check",
          position: { x: 0, y: 0 },
          config: {
            condition: {
              type: "field_equals",
              field: "status",
              value: "done",
              branch: "done",
            },
            branches: { done: "end" },
            default_branch: "end",
          },
        },
      ];
      const state: StateField[] = [statusField];
      const { consumedFields } = getConsumedInputFields(state, nodes);
      expect(consumedFields).toEqual([]);
    });
  });
});
