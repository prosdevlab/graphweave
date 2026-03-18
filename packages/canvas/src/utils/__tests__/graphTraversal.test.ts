import type { EdgeSchema, NodeSchema, StateField } from "@shared/schema";
import {
  getRelevantFields,
  getUpstreamNodeIds,
  isTerminalNode,
} from "../graphTraversal";

function edge(source: string, target: string): EdgeSchema {
  return { id: `e-${source}-${target}`, source, target };
}

function startNode(id: string): NodeSchema {
  return {
    id,
    label: "Start",
    type: "start",
    position: { x: 0, y: 0 },
    config: {},
  };
}

function endNode(id: string): NodeSchema {
  return {
    id,
    label: "End",
    type: "end",
    position: { x: 0, y: 0 },
    config: {},
  };
}

function toolNode(id: string, outputKey: string): NodeSchema {
  return {
    id,
    label: id,
    type: "tool",
    position: { x: 0, y: 0 },
    config: { tool_name: id, input_map: {}, output_key: outputKey },
  };
}

function llmNode(id: string, outputKey: string): NodeSchema {
  return {
    id,
    label: id,
    type: "llm",
    position: { x: 0, y: 0 },
    config: {
      provider: "openai",
      model: "gpt-4",
      system_prompt: "",
      temperature: 0.7,
      max_tokens: 1000,
      input_map: {},
      output_key: outputKey,
    },
  };
}

function conditionNode(id: string): NodeSchema {
  return {
    id,
    label: id,
    type: "condition",
    position: { x: 0, y: 0 },
    config: {
      condition: { type: "field_exists", field: "x", branch: "yes" },
      branches: {},
      default_branch: "yes",
    },
  };
}

function field(key: string, type: StateField["type"] = "string"): StateField {
  return { key, type, reducer: "replace" };
}

// ---------------------------------------------------------------------------
// getUpstreamNodeIds
// ---------------------------------------------------------------------------

describe("getUpstreamNodeIds", () => {
  it("returns empty set for a node with no incoming edges", () => {
    expect(getUpstreamNodeIds("A", [edge("A", "B")])).toEqual(new Set());
  });

  it("linear chain A→B→C: ancestors of C = {A,B}", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    expect(getUpstreamNodeIds("C", edges)).toEqual(new Set(["A", "B"]));
  });

  it("linear chain A→B→C: ancestors of A = {}", () => {
    const edges = [edge("A", "B"), edge("B", "C")];
    expect(getUpstreamNodeIds("A", edges)).toEqual(new Set());
  });

  it("branching A→C, B→C: ancestors of C = {A,B}", () => {
    const edges = [edge("A", "C"), edge("B", "C")];
    expect(getUpstreamNodeIds("C", edges)).toEqual(new Set(["A", "B"]));
  });

  it("diamond A→B, A→C, B→D, C→D: ancestors of D = {A,B,C}", () => {
    const edges = [
      edge("A", "B"),
      edge("A", "C"),
      edge("B", "D"),
      edge("C", "D"),
    ];
    expect(getUpstreamNodeIds("D", edges)).toEqual(new Set(["A", "B", "C"]));
  });

  it("cycle A→B→C→A: ancestors of A = {B,C} (no infinite loop)", () => {
    const edges = [edge("A", "B"), edge("B", "C"), edge("C", "A")];
    expect(getUpstreamNodeIds("A", edges)).toEqual(new Set(["B", "C"]));
  });

  it("disconnected A→B, C→D: ancestors of B = {A}", () => {
    const edges = [edge("A", "B"), edge("C", "D")];
    expect(getUpstreamNodeIds("B", edges)).toEqual(new Set(["A"]));
  });

  it("disconnected A→B, C→D: ancestors of D = {C}", () => {
    const edges = [edge("A", "B"), edge("C", "D")];
    expect(getUpstreamNodeIds("D", edges)).toEqual(new Set(["C"]));
  });

  it("single node, no edges → empty set", () => {
    expect(getUpstreamNodeIds("A", [])).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// getRelevantFields
// ---------------------------------------------------------------------------

describe("getRelevantFields", () => {
  const inputFields = [field("user_input"), field("messages", "list")];

  // Scenario 1: Start → Fetch → End — own tool_result excluded
  it("1: Start→Fetch→End: Fetch sees user_input, messages (own tool_result excluded)", () => {
    const nodes = [
      startNode("start"),
      toolNode("fetch", "tool_result"),
      endNode("end"),
    ];
    const edges = [edge("start", "fetch"), edge("fetch", "end")];
    const stateFields = [...inputFields, field("tool_result")];

    const result = getRelevantFields("fetch", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages"]);
  });

  // Scenario 2: Search sees only input fields (LLM summary is downstream)
  it("2: Start→Search→LLM→End: Search sees user_input, messages (LLM summary excluded)", () => {
    const nodes = [
      startNode("start"),
      toolNode("search", "tool_result"),
      llmNode("llm", "summary"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "search"),
      edge("search", "llm"),
      edge("llm", "end"),
    ];
    const stateFields = [
      ...inputFields,
      field("tool_result"),
      field("summary"),
    ];

    const result = getRelevantFields("search", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages"]);
  });

  // Scenario 3: LLM sees Search's output (upstream)
  it("3: Start→Search→LLM→End: LLM sees user_input, messages, tool_result", () => {
    const nodes = [
      startNode("start"),
      toolNode("search", "tool_result"),
      llmNode("llm", "summary"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "search"),
      edge("search", "llm"),
      edge("llm", "end"),
    ];
    const stateFields = [
      ...inputFields,
      field("tool_result"),
      field("summary"),
    ];

    const result = getRelevantFields("llm", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual([
      "user_input",
      "messages",
      "tool_result",
    ]);
  });

  // Scenario 4: Tool1 doesn't see downstream Tool2's output
  it("4: Start→T1→T2→End: T1 sees user_input, messages (T2's r2 excluded)", () => {
    const nodes = [
      startNode("start"),
      toolNode("t1", "r1"),
      toolNode("t2", "r2"),
      endNode("end"),
    ];
    const edges = [edge("start", "t1"), edge("t1", "t2"), edge("t2", "end")];
    const stateFields = [...inputFields, field("r1"), field("r2")];

    const result = getRelevantFields("t1", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages"]);
  });

  // Scenario 5: Tool2 sees upstream Tool1's output
  it("5: Start→T1→T2→End: T2 sees user_input, messages, r1", () => {
    const nodes = [
      startNode("start"),
      toolNode("t1", "r1"),
      toolNode("t2", "r2"),
      endNode("end"),
    ];
    const edges = [edge("start", "t1"), edge("t1", "t2"), edge("t2", "end")];
    const stateFields = [...inputFields, field("r1"), field("r2")];

    const result = getRelevantFields("t2", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages", "r1"]);
  });

  // Scenario 6: T1 doesn't see sibling T2's output in branching
  it("6: Start→Cond→[T1→End, T2→End]: T1 sees only inputs", () => {
    const nodes = [
      startNode("start"),
      conditionNode("cond"),
      toolNode("t1", "r1"),
      toolNode("t2", "r2"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "cond"),
      edge("cond", "t1"),
      edge("cond", "t2"),
      edge("t1", "end"),
      edge("t2", "end"),
    ];
    const stateFields = [...inputFields, field("r1"), field("r2")];

    const result = getRelevantFields("t1", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages"]);
  });

  // Scenario 7: T2 doesn't see sibling T1's output in branching
  it("7: Start→Cond→[T1→End, T2→End]: T2 sees only inputs", () => {
    const nodes = [
      startNode("start"),
      conditionNode("cond"),
      toolNode("t1", "r1"),
      toolNode("t2", "r2"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "cond"),
      edge("cond", "t1"),
      edge("cond", "t2"),
      edge("t1", "end"),
      edge("t2", "end"),
    ];
    const stateFields = [...inputFields, field("r1"), field("r2")];

    const result = getRelevantFields("t2", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages"]);
  });

  // Scenario 8: Parallel T1 doesn't see sibling T2 or downstream LLM
  it("8: Start→[T1,T2]→LLM→End: T1 sees only inputs", () => {
    const nodes = [
      startNode("start"),
      toolNode("t1", "r1"),
      toolNode("t2", "r2"),
      llmNode("llm", "summary"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "t1"),
      edge("start", "t2"),
      edge("t1", "llm"),
      edge("t2", "llm"),
      edge("llm", "end"),
    ];
    const stateFields = [
      ...inputFields,
      field("r1"),
      field("r2"),
      field("summary"),
    ];

    const result = getRelevantFields("t1", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input", "messages"]);
  });

  // Scenario 9: LLM after parallel tools sees both
  it("9: Start→[T1,T2]→LLM→End: LLM sees user_input, messages, r1, r2", () => {
    const nodes = [
      startNode("start"),
      toolNode("t1", "r1"),
      toolNode("t2", "r2"),
      llmNode("llm", "summary"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "t1"),
      edge("start", "t2"),
      edge("t1", "llm"),
      edge("t2", "llm"),
      edge("llm", "end"),
    ];
    const stateFields = [
      ...inputFields,
      field("r1"),
      field("r2"),
      field("summary"),
    ];

    const result = getRelevantFields("llm", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual([
      "user_input",
      "messages",
      "r1",
      "r2",
    ]);
  });

  // Scenario 10: HumanInput is not llm/tool, so its key stays in input fields
  it("10: Start→HumanInput→Tool→End: Tool sees user_input, messages, human_response", () => {
    const human: NodeSchema = {
      id: "human",
      label: "HumanInput",
      type: "human_input",
      position: { x: 0, y: 0 },
      config: { prompt: "Enter input", input_key: "human_response" },
    };
    const nodes = [
      startNode("start"),
      human,
      toolNode("tool", "tool_result"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "human"),
      edge("human", "tool"),
      edge("tool", "end"),
    ];
    const stateFields = [
      ...inputFields,
      field("human_response"),
      field("tool_result"),
    ];

    const result = getRelevantFields("tool", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual([
      "user_input",
      "messages",
      "human_response",
    ]);
  });

  // Scenario 11: Two LLMs in sequence
  it("11: Start→LLM1→LLM2→End: LLM2 sees user_input, messages, summary1", () => {
    const nodes = [
      startNode("start"),
      llmNode("llm1", "summary1"),
      llmNode("llm2", "summary2"),
      endNode("end"),
    ];
    const edges = [
      edge("start", "llm1"),
      edge("llm1", "llm2"),
      edge("llm2", "end"),
    ];
    const stateFields = [...inputFields, field("summary1"), field("summary2")];

    const result = getRelevantFields("llm2", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual([
      "user_input",
      "messages",
      "summary1",
    ]);
  });

  // Scenario 12: LLM output_key = "messages" — own output excluded
  it("12: LLM output_key='messages' — messages excluded (own output)", () => {
    const nodes = [
      startNode("start"),
      llmNode("llm", "messages"),
      endNode("end"),
    ];
    const edges = [edge("start", "llm"), edge("llm", "end")];
    const stateFields = [field("user_input"), field("messages", "list")];

    const result = getRelevantFields("llm", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toEqual(["user_input"]);
  });

  // Scenario 13: Two tools share same output_key, T1 upstream of T2
  it("13: T1 and T2 share output_key 'result', T2 includes it (T1 upstream)", () => {
    const nodes = [
      startNode("start"),
      toolNode("t1", "result"),
      toolNode("t2", "result"),
      endNode("end"),
    ];
    const edges = [edge("start", "t1"), edge("t1", "t2"), edge("t2", "end")];
    const stateFields = [...inputFields, field("result")];

    const result = getRelevantFields("t2", stateFields, nodes, edges);
    expect(result.map((f) => f.key)).toContain("result");
  });

  // Scenario 14: Empty state, empty nodes
  it("14: empty state, empty nodes → []", () => {
    expect(getRelevantFields("any", [], [], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isTerminalNode
// ---------------------------------------------------------------------------

describe("isTerminalNode", () => {
  it("no outgoing edges → true", () => {
    expect(isTerminalNode("t", [], [toolNode("t", "r"), endNode("end")])).toBe(
      true,
    );
  });

  it("all outgoing to end nodes → true", () => {
    const nodes = [toolNode("t", "r"), endNode("end")];
    expect(isTerminalNode("t", [edge("t", "end")], nodes)).toBe(true);
  });

  it("outgoing to llm → false", () => {
    const nodes = [toolNode("t", "r"), llmNode("llm", "summary")];
    expect(isTerminalNode("t", [edge("t", "llm")], nodes)).toBe(false);
  });

  it("outgoing to tool → false", () => {
    const nodes = [toolNode("t1", "r1"), toolNode("t2", "r2")];
    expect(isTerminalNode("t1", [edge("t1", "t2")], nodes)).toBe(false);
  });

  it("outgoing to condition → false", () => {
    const nodes = [toolNode("t", "r"), conditionNode("cond")];
    expect(isTerminalNode("t", [edge("t", "cond")], nodes)).toBe(false);
  });

  it("mix of end + non-end targets → false", () => {
    const nodes = [
      toolNode("t", "r"),
      endNode("end"),
      llmNode("llm", "summary"),
    ];
    expect(
      isTerminalNode("t", [edge("t", "end"), edge("t", "llm")], nodes),
    ).toBe(false);
  });

  it("outgoing target node not found → false (safety)", () => {
    const nodes = [toolNode("t", "r")]; // target "ghost" not in nodes
    expect(isTerminalNode("t", [edge("t", "ghost")], nodes)).toBe(false);
  });
});
