import type { EdgeSchema, NodeSchema } from "@shared/schema";

// Mock store state
let mockNodes: NodeSchema[] = [];
let mockEdges: EdgeSchema[] = [];
const mockAddNode = vi.fn();
const mockAddEdge = vi.fn();
const mockRemoveEdge = vi.fn();
const mockShowToast = vi.fn();

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      nodes: mockNodes,
      edges: mockEdges,
      addNode: mockAddNode,
      addEdge: mockAddEdge,
      removeEdge: mockRemoveEdge,
    }),
}));

vi.mock("@store/uiSlice", () => ({
  useUIStore: {
    getState: () => ({ showToast: mockShowToast }),
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-1234",
});

import { renderHook } from "@testing-library/react";
import { useNodePlacement } from "../useNodePlacement";

describe("useNodePlacement", () => {
  beforeEach(() => {
    mockNodes = [];
    mockEdges = [];
    mockAddNode.mockClear();
    mockAddEdge.mockClear();
    mockRemoveEdge.mockClear();
    mockShowToast.mockClear();
  });

  it("creates node at given position with correct defaults", () => {
    const { result } = renderHook(() => useNodePlacement());
    const success = result.current.placeNode("llm", { x: 100, y: 200 });

    expect(success).toBe(true);
    expect(mockAddNode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "test-uuid-1234",
        type: "llm",
        label: "LLM",
        position: { x: 100, y: 200 },
      }),
    );
  });

  it("prevents duplicate singletons — returns false and shows toast", () => {
    mockNodes = [
      {
        id: "existing-start",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
    ];

    const { result } = renderHook(() => useNodePlacement());
    const success = result.current.placeNode("start", { x: 100, y: 200 });

    expect(success).toBe(false);
    expect(mockAddNode).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      "A Start node already exists",
      "info",
    );
  });

  it("splits nearest edge when placing node near an edge", () => {
    mockNodes = [
      {
        id: "n1",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
      {
        id: "n2",
        type: "end",
        label: "End",
        position: { x: 200, y: 0 },
        config: {},
      } as NodeSchema,
    ];
    mockEdges = [{ id: "e-n1-n2", source: "n1", target: "n2" }];

    const { result } = renderHook(() => useNodePlacement());
    // Place near the midpoint of the edge
    const success = result.current.placeNode("llm", { x: 100, y: 5 });

    expect(success).toBe(true);
    expect(mockAddNode).toHaveBeenCalled();
    expect(mockRemoveEdge).toHaveBeenCalledWith("e-n1-n2");
    expect(mockAddEdge).toHaveBeenCalledTimes(2);
    expect(mockAddEdge).toHaveBeenCalledWith(
      expect.objectContaining({ source: "n1", target: "test-uuid-1234" }),
    );
    expect(mockAddEdge).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "test-uuid-1234",
        target: "n2",
      }),
    );
  });

  it("returns false for unknown node type", () => {
    const { result } = renderHook(() => useNodePlacement());
    const success = result.current.placeNode("unknown", { x: 0, y: 0 });
    expect(success).toBe(false);
    expect(mockAddNode).not.toHaveBeenCalled();
  });
});
