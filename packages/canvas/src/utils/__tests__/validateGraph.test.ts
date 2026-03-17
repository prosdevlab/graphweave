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
});
