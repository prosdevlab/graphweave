import type { EdgeSchema, NodeSchema } from "@shared/schema";
import { validateGraph } from "../validateGraph";

function makeNode(
  overrides: Partial<NodeSchema> & { type: NodeSchema["type"] },
): NodeSchema {
  return {
    id: crypto.randomUUID(),
    label: overrides.type.charAt(0).toUpperCase() + overrides.type.slice(1),
    position: { x: 0, y: 0 },
    config: {},
    ...overrides,
  } as NodeSchema;
}

function edge(source: string, target: string): EdgeSchema {
  return { id: `e-${source}-${target}`, source, target };
}

describe("validateGraph", () => {
  it("valid Start → LLM → End passes", () => {
    const start = makeNode({ type: "start" });
    const llm = makeNode({
      type: "llm",
      config: {
        provider: "openai",
        model: "gpt-4",
        system_prompt: "You are helpful",
        temperature: 0.7,
        max_tokens: 1000,
        input_map: {},
        output_key: "response",
      },
    });
    const end = makeNode({ type: "end" });
    const nodes = [start, llm, end];
    const edges = [edge(start.id, llm.id), edge(llm.id, end.id)];
    expect(validateGraph(nodes, edges)).toEqual([]);
  });

  it("rejects graph with no Start node", () => {
    const end = makeNode({ type: "end" });
    const errors = validateGraph([end], []);
    expect(errors).toContainEqual(
      expect.objectContaining({ message: "Start node required" }),
    );
  });

  it("rejects graph with no End node", () => {
    const start = makeNode({ type: "start" });
    const errors = validateGraph([start], []);
    expect(errors).toContainEqual(
      expect.objectContaining({ message: "End node required" }),
    );
  });

  it("rejects multiple Start nodes", () => {
    const s1 = makeNode({ type: "start" });
    const s2 = makeNode({ type: "start" });
    const end = makeNode({ type: "end" });
    const errors = validateGraph([s1, s2, end], []);
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: "Only one Start node allowed",
        nodeId: s2.id,
      }),
    );
  });

  it("rejects disconnected node (no outgoing)", () => {
    const start = makeNode({ type: "start" });
    const llm = makeNode({
      type: "llm",
      label: "MyLLM",
      config: {
        provider: "openai",
        model: "gpt-4",
        system_prompt: "hi",
        temperature: 0.7,
        max_tokens: 1000,
        input_map: {},
        output_key: "r",
      },
    });
    const end = makeNode({ type: "end" });
    // start → end, llm is orphan
    const errors = validateGraph([start, llm, end], [edge(start.id, end.id)]);
    expect(errors).toContainEqual(expect.objectContaining({ nodeId: llm.id }));
  });

  it("rejects LLM without system prompt", () => {
    const start = makeNode({ type: "start" });
    const llm = makeNode({
      type: "llm",
      config: {
        provider: "openai",
        model: "gpt-4",
        system_prompt: "",
        temperature: 0.7,
        max_tokens: 1000,
        input_map: {},
        output_key: "r",
      },
    });
    const end = makeNode({ type: "end" });
    const errors = validateGraph(
      [start, llm, end],
      [edge(start.id, llm.id), edge(llm.id, end.id)],
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("system prompt"),
      }),
    );
  });

  // Rule 6-7: Tool node validation
  it("rejects tool node with empty tool_name", () => {
    const start = makeNode({ type: "start" });
    const tool = makeNode({
      type: "tool",
      label: "My Tool",
      config: { tool_name: "", input_map: {}, output_key: "result" },
    });
    const end = makeNode({ type: "end" });
    const errors = validateGraph(
      [start, tool, end],
      [edge(start.id, tool.id), edge(tool.id, end.id)],
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: tool.id,
        message: expect.stringContaining("tool selected"),
      }),
    );
  });

  it("rejects tool node with empty output_key", () => {
    const start = makeNode({ type: "start" });
    const tool = makeNode({
      type: "tool",
      config: { tool_name: "calculator", input_map: {}, output_key: "" },
    });
    const end = makeNode({ type: "end" });
    const errors = validateGraph(
      [start, tool, end],
      [edge(start.id, tool.id), edge(tool.id, end.id)],
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: tool.id,
        message: expect.stringContaining("output key"),
      }),
    );
  });

  // Rule 8-10: Condition node validation
  it("rejects condition node with no outgoing branch edges", () => {
    const start = makeNode({ type: "start" });
    const cond = makeNode({
      type: "condition",
      config: {
        condition: {
          type: "field_equals",
          field: "x",
          value: "y",
          branch: "yes",
        },
        branches: {},
        default_branch: "",
      },
    });
    const end = makeNode({ type: "end" });
    // Edge exists but no condition_branch
    const errors = validateGraph(
      [start, cond, end],
      [edge(start.id, cond.id), edge(cond.id, end.id)],
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: cond.id,
        message: expect.stringContaining("no outgoing branch edges"),
      }),
    );
  });

  it("rejects condition node with edges missing condition_branch", () => {
    const start = makeNode({ type: "start" });
    const cond = makeNode({
      type: "condition",
      config: {
        condition: {
          type: "field_equals",
          field: "x",
          value: "y",
          branch: "yes",
        },
        branches: {},
        default_branch: "no",
      },
    });
    const end = makeNode({ type: "end" });
    const edges = [
      edge(start.id, cond.id),
      { id: "e1", source: cond.id, target: end.id, condition_branch: "yes" },
      { id: "e2", source: cond.id, target: end.id }, // missing condition_branch
    ];
    const errors = validateGraph([start, cond, end], edges);
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: cond.id,
        message: expect.stringContaining("edges without branch names"),
      }),
    );
  });

  it("rejects field_equals condition with empty default_branch (rule 10a)", () => {
    const start = makeNode({ type: "start" });
    const cond = makeNode({
      type: "condition",
      config: {
        condition: {
          type: "field_equals",
          field: "x",
          value: "y",
          branch: "yes",
        },
        branches: { yes: "end-id" },
        default_branch: "",
      },
    });
    const end = makeNode({ type: "end" });
    const edges = [
      edge(start.id, cond.id),
      { id: "e1", source: cond.id, target: end.id, condition_branch: "yes" },
    ];
    const errors = validateGraph([start, cond, end], edges);
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: cond.id,
        message: expect.stringContaining("default branch"),
      }),
    );
  });

  it("rejects field_equals condition with default_branch not in edge branches (rule 10a)", () => {
    const start = makeNode({ type: "start" });
    const cond = makeNode({
      type: "condition",
      config: {
        condition: {
          type: "field_equals",
          field: "x",
          value: "y",
          branch: "yes",
        },
        branches: { yes: "end-id" },
        default_branch: "nonexistent",
      },
    });
    const end = makeNode({ type: "end" });
    const edges = [
      edge(start.id, cond.id),
      { id: "e1", source: cond.id, target: end.id, condition_branch: "yes" },
    ];
    const errors = validateGraph([start, cond, end], edges);
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: cond.id,
        message: expect.stringContaining("default branch does not match"),
      }),
    );
  });

  it("passes tool_error condition with empty default_branch (rule 10b — exhaustive)", () => {
    const start = makeNode({ type: "start" });
    const cond = makeNode({
      type: "condition",
      config: {
        condition: {
          type: "tool_error",
          on_error: "error",
          on_success: "success",
        },
        branches: { error: "end-id", success: "end-id" },
        default_branch: "",
      },
    });
    const end = makeNode({ type: "end" });
    const edges = [
      edge(start.id, cond.id),
      { id: "e1", source: cond.id, target: end.id, condition_branch: "error" },
      {
        id: "e2",
        source: cond.id,
        target: end.id,
        condition_branch: "success",
      },
    ];
    const errors = validateGraph([start, cond, end], edges);
    // No default_branch errors for exhaustive types
    expect(errors.filter((e) => e.nodeId === cond.id)).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("default branch"),
      }),
    );
  });

  // Rules 11-12: HumanInput node validation
  it("rejects human_input node with empty prompt", () => {
    const start = makeNode({ type: "start" });
    const hi = makeNode({
      type: "human_input",
      config: { prompt: "", input_key: "user_input", timeout_ms: 300000 },
    });
    const end = makeNode({ type: "end" });
    const errors = validateGraph(
      [start, hi, end],
      [edge(start.id, hi.id), edge(hi.id, end.id)],
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: hi.id,
        message: expect.stringContaining("needs a prompt"),
      }),
    );
  });

  it("rejects human_input node with empty input_key", () => {
    const start = makeNode({ type: "start" });
    const hi = makeNode({
      type: "human_input",
      config: {
        prompt: "Please provide input:",
        input_key: "",
        timeout_ms: 300000,
      },
    });
    const end = makeNode({ type: "end" });
    const errors = validateGraph(
      [start, hi, end],
      [edge(start.id, hi.id), edge(hi.id, end.id)],
    );
    expect(errors).toContainEqual(
      expect.objectContaining({
        nodeId: hi.id,
        message: expect.stringContaining("input key"),
      }),
    );
  });
});
