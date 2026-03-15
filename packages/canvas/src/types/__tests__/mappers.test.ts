import type { EdgeSchema, NodeSchema } from "@shared/schema";
import { toEdgeSchema, toNodeSchema, toRFEdge, toRFNode } from "../mappers";

const sampleNode: NodeSchema = {
  id: "n1",
  type: "llm",
  label: "Chat",
  position: { x: 100, y: 200 },
  config: { provider: "openai", model: "gpt-4o" },
} as NodeSchema;

const sampleEdge: EdgeSchema = {
  id: "e1",
  source: "a",
  target: "b",
  label: "next",
};

describe("mappers", () => {
  it("toRFNode maps NodeSchema to RF Node with data", () => {
    const rfNode = toRFNode(sampleNode);
    expect(rfNode.id).toBe("n1");
    expect(rfNode.type).toBe("llm");
    expect(rfNode.position).toEqual({ x: 100, y: 200 });
    expect((rfNode.data as Record<string, unknown>).label).toBe("Chat");
  });

  it("toNodeSchema maps RF Node back, using RF position", () => {
    const rfNode = toRFNode(sampleNode);
    rfNode.position = { x: 300, y: 400 };
    const node = toNodeSchema(rfNode);
    expect(node.position).toEqual({ x: 300, y: 400 });
    expect(node.label).toBe("Chat");
  });

  it("toRFEdge maps EdgeSchema to RF Edge", () => {
    const rfEdge = toRFEdge(sampleEdge);
    expect(rfEdge.id).toBe("e1");
    expect(rfEdge.source).toBe("a");
    expect(rfEdge.target).toBe("b");
    expect(rfEdge.label).toBe("next");
  });

  it("toEdgeSchema maps RF Edge back", () => {
    const rfEdge = toRFEdge(sampleEdge);
    const edge = toEdgeSchema(rfEdge);
    expect(edge.id).toBe("e1");
    expect(edge.source).toBe("a");
    expect(edge.target).toBe("b");
    expect(edge.label).toBe("next");
  });

  it("roundtrip: toNodeSchema(toRFNode(node)) preserves data", () => {
    const roundtripped = toNodeSchema(toRFNode(sampleNode));
    expect(roundtripped.id).toBe(sampleNode.id);
    expect(roundtripped.type).toBe(sampleNode.type);
    expect(roundtripped.label).toBe(sampleNode.label);
    expect(roundtripped.position).toEqual(sampleNode.position);
  });
});
