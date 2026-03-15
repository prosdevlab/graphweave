import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { CanvasProvider, useCanvasContext } from "../CanvasContext";

vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ screenToFlowPosition: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <CanvasProvider>{children}</CanvasProvider>;
}

describe("CanvasContext", () => {
  it("throws when used outside CanvasProvider", () => {
    expect(() => {
      renderHook(() => useCanvasContext());
    }).toThrow("useCanvasContext must be used within a CanvasProvider");
  });

  it("provides selectedNodeId (initially null)", () => {
    const { result } = renderHook(() => useCanvasContext(), { wrapper });
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("setSelectedNodeId updates the value", () => {
    const { result } = renderHook(() => useCanvasContext(), { wrapper });
    act(() => {
      result.current.setSelectedNodeId("node-1");
    });
    expect(result.current.selectedNodeId).toBe("node-1");
  });

  it("setSelectedNodeId(null) clears selection", () => {
    const { result } = renderHook(() => useCanvasContext(), { wrapper });
    act(() => {
      result.current.setSelectedNodeId("node-1");
    });
    expect(result.current.selectedNodeId).toBe("node-1");
    act(() => {
      result.current.setSelectedNodeId(null);
    });
    expect(result.current.selectedNodeId).toBeNull();
  });
});
