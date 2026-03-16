import type { GraphSchema } from "@shared/schema";
import { useGraphStore } from "../graphSlice";

vi.mock("@api/graphs", () => ({
  createGraph: vi.fn(),
  getGraph: vi.fn(),
  listGraphs: vi.fn(),
  updateGraph: vi.fn(),
  deleteGraph: vi.fn(),
}));

const mocked = await import("@api/graphs");
const { createGraph, getGraph, listGraphs, updateGraph } = mocked;

const mockGraph: GraphSchema = {
  id: "g1",
  name: "Test",
  version: 1,
  state: [],
  nodes: [],
  edges: [],
  metadata: { created_at: "2026-01-01", updated_at: "2026-01-01" },
} as unknown as GraphSchema;

beforeEach(() => {
  vi.clearAllMocks();
  useGraphStore.setState({
    graph: null,
    nodes: [],
    edges: [],
    dirty: false,
    persisted: false,
    saving: false,
    saveError: null,
  });
});

describe("graphSlice save/load", () => {
  it("saveGraph calls createGraph when persisted is false", async () => {
    vi.mocked(createGraph).mockResolvedValue(mockGraph);
    useGraphStore.getState().newGraph("New");
    await useGraphStore.getState().saveGraph();
    expect(createGraph).toHaveBeenCalled();
    expect(updateGraph).not.toHaveBeenCalled();
  });

  it("saveGraph calls updateGraph when persisted is true", async () => {
    vi.mocked(updateGraph).mockResolvedValue(mockGraph);
    useGraphStore.getState().newGraph("Existing");
    useGraphStore.setState({ persisted: true });
    await useGraphStore.getState().saveGraph();
    expect(updateGraph).toHaveBeenCalled();
    expect(createGraph).not.toHaveBeenCalled();
  });

  it("saveGraph sets persisted: true on success", async () => {
    vi.mocked(createGraph).mockResolvedValue(mockGraph);
    useGraphStore.getState().newGraph("New");
    await useGraphStore.getState().saveGraph();
    expect(useGraphStore.getState().persisted).toBe(true);
  });

  it("saveGraph sets dirty: false on success", async () => {
    vi.mocked(createGraph).mockResolvedValue(mockGraph);
    useGraphStore.getState().newGraph("New");
    useGraphStore.setState({ dirty: true });
    await useGraphStore.getState().saveGraph();
    expect(useGraphStore.getState().dirty).toBe(false);
  });

  it("saveGraph sets saveError on failure", async () => {
    vi.mocked(createGraph).mockRejectedValue(new Error("Network error"));
    useGraphStore.getState().newGraph("Fail");
    await useGraphStore.getState().saveGraph();
    expect(useGraphStore.getState().saveError).toBe("Network error");
    expect(useGraphStore.getState().saving).toBe(false);
  });

  it("saveGraph sets saving: true during save, false after", async () => {
    let resolveFn: (v: GraphSchema) => void = () => {};
    vi.mocked(createGraph).mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    useGraphStore.getState().newGraph("Saving");
    const promise = useGraphStore.getState().saveGraph();
    expect(useGraphStore.getState().saving).toBe(true);
    resolveFn(mockGraph);
    await promise;
    expect(useGraphStore.getState().saving).toBe(false);
  });

  it("successful save after error clears saveError", async () => {
    vi.mocked(createGraph).mockRejectedValueOnce(new Error("Fail"));
    useGraphStore.getState().newGraph("Retry");
    await useGraphStore.getState().saveGraph();
    expect(useGraphStore.getState().saveError).toBe("Fail");

    vi.mocked(createGraph).mockResolvedValueOnce(mockGraph);
    await useGraphStore.getState().saveGraph();
    expect(useGraphStore.getState().saveError).toBeNull();
  });

  it("fallback to create when update returns 'Graph not found'", async () => {
    vi.mocked(updateGraph).mockRejectedValue(new Error("Graph not found"));
    vi.mocked(createGraph).mockResolvedValue(mockGraph);
    useGraphStore.getState().newGraph("Orphan");
    useGraphStore.setState({ persisted: true });
    await useGraphStore.getState().saveGraph();
    expect(updateGraph).toHaveBeenCalled();
    expect(createGraph).toHaveBeenCalled();
    expect(useGraphStore.getState().persisted).toBe(true);
    expect(useGraphStore.getState().dirty).toBe(false);
    expect(useGraphStore.getState().saveError).toBeNull();
  });

  it("does not fallback for other errors", async () => {
    vi.mocked(updateGraph).mockRejectedValue(new Error("Network error"));
    useGraphStore.getState().newGraph("Broken");
    useGraphStore.setState({ persisted: true });
    await useGraphStore.getState().saveGraph();
    expect(updateGraph).toHaveBeenCalled();
    expect(createGraph).not.toHaveBeenCalled();
    expect(useGraphStore.getState().saveError).toBe("Network error");
  });

  it("loadGraph loads graph from API and sets store state", async () => {
    vi.mocked(getGraph).mockResolvedValue(mockGraph);
    await useGraphStore.getState().loadGraph("g1");
    expect(useGraphStore.getState().graph?.name).toBe("Test");
  });

  it("loadGraph sets dirty: false and persisted: true", async () => {
    vi.mocked(getGraph).mockResolvedValue(mockGraph);
    useGraphStore.setState({ dirty: true });
    await useGraphStore.getState().loadGraph("g1");
    expect(useGraphStore.getState().dirty).toBe(false);
    expect(useGraphStore.getState().persisted).toBe(true);
  });

  it("loadGraph sets saveError on failure", async () => {
    vi.mocked(getGraph).mockRejectedValue(new Error("Not found"));
    await useGraphStore.getState().loadGraph("bad");
    expect(useGraphStore.getState().saveError).toBe("Not found");
  });

  it("loadGraphList returns graphs from API", async () => {
    vi.mocked(listGraphs).mockResolvedValue([mockGraph]);
    const result = await useGraphStore.getState().loadGraphList();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Test");
  });
});
