import type { NodeSchema } from "@shared/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeConfigPanel } from "../NodeConfigPanel";

const startNode = {
  id: "s1",
  type: "start",
  label: "Start",
  position: { x: 0, y: 0 },
  config: {},
} as NodeSchema;

const llmNode = {
  id: "l1",
  type: "llm",
  label: "Chat",
  position: { x: 0, y: 0 },
  config: {
    provider: "openai",
    model: "gpt-4o",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 1024,
    input_map: {},
    output_key: "result",
  },
} as NodeSchema;

const endNode = {
  id: "e1",
  type: "end",
  label: "End",
  position: { x: 0, y: 0 },
  config: {},
} as NodeSchema;

// Mock CanvasContext
const mockSetSelectedNodeId = vi.fn();
vi.mock("@contexts/CanvasContext", () => ({
  useCanvasContext: () => ({
    selectedNodeId: mockSelectedNodeId,
    setSelectedNodeId: mockSetSelectedNodeId,
    reactFlowInstance: null,
  }),
}));

// Mock graphSlice
const mockUpdateNodeConfig = vi.fn();
const mockRemoveNode = vi.fn();
let mockNodes: NodeSchema[] = [];
let mockSelectedNodeId: string | null = null;

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      nodes: mockNodes,
      edges: [],
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "llm_response", type: "string", reducer: "replace" },
        ],
      },
      updateNodeConfig: mockUpdateNodeConfig,
      removeNode: mockRemoveNode,
    }),
}));

beforeEach(() => {
  mockNodes = [startNode, llmNode, endNode];
  mockSelectedNodeId = null;
  vi.clearAllMocks();
});

describe("NodeConfigPanel", () => {
  it("renders nothing (closed sheet) when no node is selected", () => {
    mockSelectedNodeId = null;
    const { container } = render(<NodeConfigPanel />);
    const sheet = container.querySelector("[role='dialog']");
    expect(sheet).toHaveAttribute("aria-hidden", "true");
  });

  it('renders StartNodeConfig when selected node is type "start"', () => {
    mockSelectedNodeId = "s1";
    render(<NodeConfigPanel />);
    expect(screen.getByText("START Node")).toBeInTheDocument();
    expect(screen.getByText(/entry point/i)).toBeInTheDocument();
  });

  it('renders LLMNodeConfig when selected node is type "llm"', () => {
    mockSelectedNodeId = "l1";
    render(<NodeConfigPanel />);
    expect(screen.getByText("LLM Node")).toBeInTheDocument();
    // Model settings are collapsed by default; check for the section toggle
    expect(screen.getByText("Model Settings")).toBeInTheDocument();
  });

  it('renders EndNodeConfig when selected node is type "end"', () => {
    mockSelectedNodeId = "e1";
    render(<NodeConfigPanel />);
    expect(screen.getByText("END Node")).toBeInTheDocument();
    expect(screen.getByText(/exit point/i)).toBeInTheDocument();
  });

  it("clicking close button calls setSelectedNodeId(null)", async () => {
    mockSelectedNodeId = "s1";
    render(<NodeConfigPanel />);
    await userEvent.click(screen.getByLabelText("Close panel"));
    expect(mockSetSelectedNodeId).toHaveBeenCalledWith(null);
  });

  it("clicking delete button calls removeNode and clears selection", async () => {
    mockSelectedNodeId = "s1";
    render(<NodeConfigPanel />);
    await userEvent.click(screen.getByText(/delete node/i));
    expect(mockRemoveNode).toHaveBeenCalledWith("s1");
    expect(mockSetSelectedNodeId).toHaveBeenCalledWith(null);
  });
});
