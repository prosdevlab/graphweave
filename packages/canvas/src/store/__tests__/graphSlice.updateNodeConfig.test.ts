import type { NodeSchema } from "@shared/schema";
import { useGraphStore } from "../graphSlice";

const makeNode = (id: string, type = "llm", label = "Node"): NodeSchema =>
  ({
    id,
    type,
    label,
    position: { x: 0, y: 0 },
    config: { provider: "openai", model: "gpt-4o" },
  }) as NodeSchema;

beforeEach(() => {
  useGraphStore.setState({
    graph: null,
    nodes: [makeNode("n1", "llm", "Chat"), makeNode("n2", "start", "Start")],
    edges: [],
    dirty: false,
  });
});

describe("graphSlice.updateNodeConfig", () => {
  it("updates label only", () => {
    useGraphStore.getState().updateNodeConfig("n1", { label: "Renamed" });
    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node?.label).toBe("Renamed");
  });

  it("updates config only (partial merge)", () => {
    useGraphStore
      .getState()
      .updateNodeConfig("n1", { config: { model: "gpt-4-turbo" } });
    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node?.config).toMatchObject({
      provider: "openai",
      model: "gpt-4-turbo",
    });
  });

  it("updates both label and config", () => {
    useGraphStore.getState().updateNodeConfig("n1", {
      label: "New",
      config: { temperature: 0.5 },
    });
    const node = useGraphStore.getState().nodes.find((n) => n.id === "n1");
    expect(node?.label).toBe("New");
    expect(node?.config).toMatchObject({ temperature: 0.5 });
  });

  it("sets dirty to true", () => {
    useGraphStore.getState().updateNodeConfig("n1", { label: "X" });
    expect(useGraphStore.getState().dirty).toBe(true);
  });

  it("does not affect other nodes", () => {
    useGraphStore.getState().updateNodeConfig("n1", { label: "Changed" });
    const n2 = useGraphStore.getState().nodes.find((n) => n.id === "n2");
    expect(n2?.label).toBe("Start");
  });
});
