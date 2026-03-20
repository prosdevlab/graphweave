import type { EdgeSchema, NodeSchema } from "@shared/schema";
import { useGraphStore } from "../graphSlice";

const makeNode = (id: string, type = "llm"): NodeSchema =>
  ({
    id,
    type,
    label: id,
    position: { x: 0, y: 0 },
    config: {},
  }) as NodeSchema;

const makeEdge = (id: string, source: string, target: string): EdgeSchema => ({
  id,
  source,
  target,
});

beforeEach(() => {
  useGraphStore.setState({
    graph: null,
    nodes: [],
    edges: [],
    dirty: false,
  });
});

describe("graphSlice", () => {
  it("newGraph creates a graph with default state", () => {
    useGraphStore.getState().newGraph("Test");
    const { graph } = useGraphStore.getState();
    expect(graph).not.toBeNull();
    expect(graph?.name).toBe("Test");
    expect(graph?.state).toHaveLength(3);
    expect(graph?.state[0] ?? {}).toMatchObject({
      key: "messages",
      type: "list",
      reducer: "append",
      readonly: true,
    });
    expect(graph?.state[1] ?? {}).toMatchObject({
      key: "user_input",
      type: "string",
      reducer: "replace",
    });
    expect(graph?.state[2] ?? {}).toMatchObject({
      key: "llm_response",
      type: "string",
      reducer: "replace",
    });
  });

  it("newGraph pre-places Start and End nodes connected by an edge", () => {
    useGraphStore.getState().newGraph("Starter");
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes).toHaveLength(2);
    const [startNode, endNode] = nodes;
    expect(startNode).toBeDefined();
    expect(endNode).toBeDefined();
    expect(startNode?.type).toBe("start");
    expect(endNode?.type).toBe("end");
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source).toBe(startNode?.id);
    expect(edges[0]?.target).toBe(endNode?.id);
  });

  it("newGraph sets dirty to false", () => {
    useGraphStore.getState().newGraph("Clean");
    expect(useGraphStore.getState().dirty).toBe(false);
  });

  it("addNode adds a node and sets dirty", () => {
    useGraphStore.getState().newGraph("G");
    useGraphStore.getState().addNode(makeNode("n1"));
    const { nodes, dirty } = useGraphStore.getState();
    expect(nodes).toHaveLength(3); // 2 starter + 1 added
    expect(dirty).toBe(true);
  });

  it("removeNode removes the node and its connected edges", () => {
    useGraphStore.setState({
      nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
      edges: [makeEdge("e1", "a", "b"), makeEdge("e2", "b", "c")],
    });
    useGraphStore.getState().removeNode("b");
    const { nodes, edges, dirty } = useGraphStore.getState();
    expect(nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(edges).toHaveLength(0);
    expect(dirty).toBe(true);
  });

  it("updateNodePosition updates position and sets dirty", () => {
    useGraphStore.setState({ nodes: [makeNode("n1")] });
    useGraphStore.getState().updateNodePosition("n1", { x: 100, y: 200 });
    const { nodes, dirty } = useGraphStore.getState();
    expect(nodes[0]?.position).toEqual({ x: 100, y: 200 });
    expect(dirty).toBe(true);
  });

  it("addEdge adds an edge", () => {
    useGraphStore.getState().addEdge(makeEdge("e1", "a", "b"));
    const { edges, dirty } = useGraphStore.getState();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe("e1");
    expect(dirty).toBe(true);
  });

  it("removeEdge removes the edge", () => {
    useGraphStore.setState({
      edges: [makeEdge("e1", "a", "b"), makeEdge("e2", "b", "c")],
    });
    useGraphStore.getState().removeEdge("e1");
    const { edges } = useGraphStore.getState();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe("e2");
  });

  it("removeNodes removes multiple nodes and their edges", () => {
    useGraphStore.setState({
      nodes: [makeNode("a"), makeNode("b"), makeNode("c")],
      edges: [
        makeEdge("e1", "a", "b"),
        makeEdge("e2", "b", "c"),
        makeEdge("e3", "a", "c"),
      ],
    });
    useGraphStore.getState().removeNodes(["a", "b"]);
    const { nodes, edges } = useGraphStore.getState();
    expect(nodes.map((n) => n.id)).toEqual(["c"]);
    expect(edges).toHaveLength(0); // all edges touched a or b
  });

  it("setGraph loads graph and sets dirty to false", () => {
    const graph = {
      id: "g1",
      name: "Loaded",
      version: 1,
      state: [],
      nodes: [makeNode("n1")],
      edges: [],
      metadata: { created_at: "2026-01-01", updated_at: "2026-01-01" },
    } as unknown as import("@shared/schema").GraphSchema;
    useGraphStore.setState({ dirty: true });
    useGraphStore.getState().setGraph(graph);
    const state = useGraphStore.getState();
    expect(state.graph?.name).toBe("Loaded");
    expect(state.nodes).toHaveLength(1);
    expect(state.dirty).toBe(false);
  });

  it("renameGraph updates graph name and sets dirty to true", () => {
    useGraphStore.getState().newGraph("Old Name");
    useGraphStore.getState().renameGraph("New Name");
    const { graph, dirty } = useGraphStore.getState();
    expect(graph?.name).toBe("New Name");
    expect(dirty).toBe(true);
  });

  it("removeStateFields ignores readonly fields", () => {
    useGraphStore.getState().newGraph("G");
    const before = useGraphStore.getState().graph?.state ?? [];
    // messages is readonly, user_input is not
    useGraphStore.getState().removeStateFields(["messages", "user_input"]);
    const after = useGraphStore.getState().graph?.state ?? [];
    expect(after.find((f) => f.key === "messages")).toBeDefined();
    expect(after.find((f) => f.key === "user_input")).toBeUndefined();
    expect(after).toHaveLength(before.length - 1);
  });

  it("addStateFields deduplicates against existing keys", () => {
    useGraphStore.getState().newGraph("G");
    const before = useGraphStore.getState().graph?.state ?? [];
    useGraphStore
      .getState()
      .addStateFields([
        { key: "messages", type: "string", reducer: "replace" },
      ]);
    const after = useGraphStore.getState().graph?.state ?? [];
    expect(after).toHaveLength(before.length);
  });
});

describe("renameOutputKey", () => {
  const toolNode = (
    id: string,
    outputKey: string,
    inputMap: Record<string, string> = {},
  ): NodeSchema =>
    ({
      id,
      type: "tool",
      label: id,
      position: { x: 0, y: 0 },
      config: { tool_name: id, input_map: inputMap, output_key: outputKey },
    }) as NodeSchema;

  const llmNode = (
    id: string,
    outputKey: string,
    inputMap: Record<string, string> = {},
  ): NodeSchema =>
    ({
      id,
      type: "llm",
      label: id,
      position: { x: 0, y: 0 },
      config: {
        provider: "openai",
        model: "gpt-4",
        system_prompt: "",
        temperature: 0.7,
        max_tokens: 1000,
        input_map: inputMap,
        output_key: outputKey,
      },
    }) as NodeSchema;

  const condNode = (id: string, field: string): NodeSchema =>
    ({
      id,
      type: "condition",
      label: id,
      position: { x: 0, y: 0 },
      config: {
        condition: { type: "field_exists", field, branch: "yes" },
        branches: {},
        default_branch: "yes",
      },
    }) as NodeSchema;

  it("rewrites downstream tool input_map values", () => {
    useGraphStore.getState().newGraph("G");
    useGraphStore.setState({
      nodes: [
        toolNode("t1", "old_result"),
        toolNode("t2", "t2_result", { context: "old_result[-1].content" }),
      ],
    });
    useGraphStore.getState().renameOutputKey("t1", "old_result", "new_result");
    const t2 = useGraphStore.getState().nodes.find((n) => n.id === "t2");
    expect(
      (t2?.config as { input_map: Record<string, string> }).input_map.context,
    ).toBe("new_result[-1].content");
  });

  it("rewrites downstream llm input_map values", () => {
    useGraphStore.getState().newGraph("G");
    useGraphStore.setState({
      nodes: [
        toolNode("t1", "old_result"),
        llmNode("llm1", "response", { data: "old_result" }),
      ],
    });
    useGraphStore.getState().renameOutputKey("t1", "old_result", "new_result");
    const llm = useGraphStore.getState().nodes.find((n) => n.id === "llm1");
    expect(
      (llm?.config as { input_map: Record<string, string> }).input_map.data,
    ).toBe("new_result");
  });

  it("rewrites condition node field", () => {
    useGraphStore.getState().newGraph("G");
    useGraphStore.setState({
      nodes: [toolNode("t1", "old_result"), condNode("c1", "old_result")],
    });
    useGraphStore.getState().renameOutputKey("t1", "old_result", "new_result");
    const c = useGraphStore.getState().nodes.find((n) => n.id === "c1");
    expect(
      (c?.config as { condition: { field: string } }).condition.field,
    ).toBe("new_result");
  });

  it("renames state field entry", () => {
    useGraphStore.getState().newGraph("G");
    useGraphStore
      .getState()
      .addStateFields([
        { key: "old_result", type: "object", reducer: "replace" },
      ]);
    useGraphStore.setState({ nodes: [toolNode("t1", "old_result")] });
    useGraphStore.getState().renameOutputKey("t1", "old_result", "new_result");
    const state = useGraphStore.getState().graph?.state ?? [];
    expect(state.find((f) => f.key === "old_result")).toBeUndefined();
    expect(state.find((f) => f.key === "new_result")).toBeDefined();
  });

  it("no-ops when oldKey === newKey", () => {
    useGraphStore.getState().newGraph("G");
    useGraphStore.setState({
      nodes: [toolNode("t1", "result")],
      dirty: false,
    });
    useGraphStore.getState().renameOutputKey("t1", "result", "result");
    expect(useGraphStore.getState().dirty).toBe(false);
  });
});
