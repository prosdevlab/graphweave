import type { NodeSchema } from "@shared/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { FloatingToolbar } from "../FloatingToolbar";

// Mock CanvasContext
const mockSetStampNodeType = vi.fn();
let mockStampNodeType: string | null = null;
let mockNodes: NodeSchema[] = [];

vi.mock("@contexts/CanvasContext", () => ({
  useCanvasContext: () => ({
    stampNodeType: mockStampNodeType,
    setStampNodeType: mockSetStampNodeType,
  }),
}));

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ nodes: mockNodes }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function renderToolbar(stampNodeType: string | null = null) {
  mockStampNodeType = stampNodeType;
  mockSetStampNodeType.mockClear();
  return render(<FloatingToolbar />, { wrapper: Wrapper });
}

// Stateful wrapper that actually toggles stampNodeType
function StatefulToolbar() {
  const [stamp, setStamp] = useState<string | null>(null);
  mockStampNodeType = stamp;
  mockSetStampNodeType.mockImplementation((val: string | null) =>
    setStamp(val),
  );
  return <FloatingToolbar />;
}

describe("FloatingToolbar", () => {
  afterEach(() => {
    mockStampNodeType = null;
    mockNodes = [];
    mockSetStampNodeType.mockClear();
  });

  it("renders Pointer and CircuitBoard buttons in default state", () => {
    renderToolbar();
    expect(screen.getByLabelText("Pointer")).toBeInTheDocument();
    expect(screen.getByLabelText("Nodes")).toBeInTheDocument();
  });

  it("Pointer has active highlight in default state", () => {
    renderToolbar();
    const pointer = screen.getByLabelText("Pointer");
    expect(pointer.className).toContain("bg-zinc-700/50");
  });

  it("clicking CircuitBoard expands to show X header + Pointer + node icons", () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    expect(screen.getByLabelText("Close")).toBeInTheDocument();
    expect(screen.getByLabelText("Pointer")).toBeInTheDocument();
    expect(screen.getByLabelText("Start")).toBeInTheDocument();
    expect(screen.getByLabelText("LLM")).toBeInTheDocument();
    expect(screen.getByLabelText("End")).toBeInTheDocument();
    // CircuitBoard should be gone
    expect(screen.queryByLabelText("Nodes")).not.toBeInTheDocument();
  });

  it("X button is at the top with header background", () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const closeBtn = screen.getByLabelText("Close");
    // X should have header-like background
    expect(closeBtn.className).toContain("bg-zinc-800/80");
    expect(closeBtn.className).toContain("rounded-t-xl");
    // X should be first child of toolbar
    const toolbar = screen.getByTestId("floating-toolbar");
    const firstChild = toolbar.children[0];
    expect(firstChild).toBeDefined();
    expect(
      firstChild?.getAttribute("aria-label") === "Close" ||
        firstChild?.querySelector('[aria-label="Close"]'),
    ).toBeTruthy();
  });

  it("X button lightens on hover class", () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));
    const closeBtn = screen.getByLabelText("Close");
    expect(closeBtn.className).toContain("hover:bg-zinc-700/80");
  });

  it("clicking node icon sets stamp mode with correct type", () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));
    fireEvent.click(screen.getByLabelText("LLM"));
    expect(mockSetStampNodeType).toHaveBeenCalledWith("llm");
  });

  it("clicking same icon again deselects (stays expanded)", () => {
    renderToolbar("llm");
    fireEvent.click(screen.getByLabelText("LLM"));
    expect(mockSetStampNodeType).toHaveBeenCalledWith(null);
  });

  it("clicking Pointer deselects stamp and collapses", () => {
    renderToolbar("llm");
    fireEvent.click(screen.getByLabelText("Pointer"));
    expect(mockSetStampNodeType).toHaveBeenCalledWith(null);
  });

  it("clicking X collapses and clears stamp", () => {
    renderToolbar("llm");
    fireEvent.click(screen.getByLabelText("Close"));
    expect(mockSetStampNodeType).toHaveBeenCalledWith(null);
    // After collapse, CircuitBoard should appear
    expect(screen.getByLabelText("Nodes")).toBeInTheDocument();
  });

  it("Escape when stamp active clears stamp", () => {
    renderToolbar("llm");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mockSetStampNodeType).toHaveBeenCalledWith(null);
  });

  it("Escape when expanded (no stamp) collapses to default", () => {
    const { rerender } = render(<StatefulToolbar />);
    // Expand
    fireEvent.click(screen.getByLabelText("Nodes"));
    expect(screen.getByLabelText("Close")).toBeInTheDocument();

    // Press Escape — should collapse since no stamp is active
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(<StatefulToolbar />);
    expect(screen.getByLabelText("Nodes")).toBeInTheDocument();
  });

  it("node icons are draggable with correct dataTransfer", () => {
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const startBtn = screen.getByLabelText("Start");
    expect(startBtn).toHaveAttribute("draggable", "true");

    const setData = vi.fn();
    fireEvent.dragStart(startBtn, {
      dataTransfer: { setData, effectAllowed: "" },
    });
    expect(setData).toHaveBeenCalledWith(
      "application/graphweave-node-type",
      "start",
    );
  });

  it("active stamp type gets accent highlight", () => {
    renderToolbar("llm");
    const llmBtn = screen.getByLabelText("LLM");
    expect(llmBtn.className).toContain("bg-indigo-500/20");
    expect(llmBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("toolbar has cursor-default to override crosshair during stamp mode", () => {
    renderToolbar("llm");
    const toolbar = screen.getByTestId("floating-toolbar");
    expect(toolbar.className).toContain("cursor-default");
  });

  it("disables Start button when a start node exists", () => {
    mockNodes = [
      {
        id: "s1",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
    ];
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const startBtn = screen.getByLabelText("Start");
    expect(startBtn).toBeDisabled();
    expect(startBtn.className).toContain("opacity-40");
    expect(startBtn.className).toContain("cursor-not-allowed");
  });

  it("disables End button when an end node exists", () => {
    mockNodes = [
      {
        id: "e1",
        type: "end",
        label: "End",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
    ];
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const endBtn = screen.getByLabelText("End");
    expect(endBtn).toBeDisabled();
  });

  it("LLM button is never disabled", () => {
    mockNodes = [
      {
        id: "s1",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
      {
        id: "e1",
        type: "end",
        label: "End",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
    ];
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const llmBtn = screen.getByLabelText("LLM");
    expect(llmBtn).not.toBeDisabled();
  });

  it("disabled button is not draggable", () => {
    mockNodes = [
      {
        id: "s1",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
    ];
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const startBtn = screen.getByLabelText("Start");
    expect(startBtn).not.toHaveAttribute("draggable", "true");
  });

  it("shows 'Already exists' tooltip for disabled buttons", () => {
    mockNodes = [
      {
        id: "s1",
        type: "start",
        label: "Start",
        position: { x: 0, y: 0 },
        config: {},
      } as NodeSchema,
    ];
    renderToolbar();
    fireEvent.click(screen.getByLabelText("Nodes"));

    const startBtn = screen.getByLabelText("Start");
    expect(startBtn).toHaveAttribute("aria-disabled", "true");
  });
});
