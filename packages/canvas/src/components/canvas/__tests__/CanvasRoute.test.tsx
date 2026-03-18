import { render, screen, waitFor } from "@testing-library/react";
import { CanvasRoute } from "../CanvasRoute";

HTMLDialogElement.prototype.showModal ??= vi.fn(function (
  this: HTMLDialogElement,
) {
  this.setAttribute("open", "");
});
HTMLDialogElement.prototype.close ??= vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

const mockNavigate = vi.fn();
const mockLoadGraph = vi.fn(() => Promise.resolve());

let mockGraph: { id: string; name: string } | null = null;
let mockSaveError: string | null = null;

vi.mock("react-router", () => ({
  useParams: () => ({ id: "test-id" }),
  useNavigate: () => mockNavigate,
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      graph: mockGraph,
      saveError: mockSaveError,
      loadGraph: mockLoadGraph,
      dirty: false,
      nodes: [],
      edges: [],
    }),
}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@contexts/CanvasContext", () => ({
  CanvasProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../CanvasHeader", () => ({
  CanvasHeader: () => <div data-testid="canvas-header">Header</div>,
}));

vi.mock("../GraphCanvas", () => ({
  GraphCanvas: () => <div data-testid="graph-canvas">Canvas</div>,
}));

vi.mock("../../panels/NodeConfigPanel", () => ({
  NodeConfigPanel: () => <div data-testid="node-config-panel">Panel</div>,
}));

vi.mock("../../panels/RunPanel", () => ({
  RunPanel: () => <div data-testid="run-panel">RunPanel</div>,
}));

vi.mock("../../panels/StatePanel", () => ({
  StatePanel: () => <div data-testid="state-panel">StatePanel</div>,
}));

beforeEach(() => {
  mockGraph = null;
  mockSaveError = null;
  vi.clearAllMocks();
  mockLoadGraph.mockResolvedValue(undefined);
});

describe("CanvasRoute", () => {
  it("shows loading state initially", () => {
    render(<CanvasRoute />);
    expect(screen.getByText("Loading graph...")).toBeInTheDocument();
  });

  it("calls loadGraph with URL param id", () => {
    render(<CanvasRoute />);
    expect(mockLoadGraph).toHaveBeenCalledWith("test-id");
  });

  it("renders canvas content after load completes", async () => {
    mockLoadGraph.mockImplementation(() => {
      mockGraph = { id: "test-id", name: "Test" };
      return Promise.resolve();
    });
    render(<CanvasRoute />);
    await waitFor(() => {
      expect(screen.getByTestId("canvas-header")).toBeInTheDocument();
    });
    expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("node-config-panel")).toBeInTheDocument();
  });

  it("shows error state when saveError is set and graph is null", async () => {
    mockSaveError = "Graph not found";
    mockLoadGraph.mockResolvedValue(undefined);
    render(<CanvasRoute />);
    await waitFor(() => {
      expect(screen.getByText("Graph not found")).toBeInTheDocument();
    });
    expect(screen.getByText("Back to home")).toBeInTheDocument();
  });

  it("does not call loadGraph when graph.id matches URL param", () => {
    mockGraph = { id: "test-id", name: "Test" };
    render(<CanvasRoute />);
    expect(mockLoadGraph).not.toHaveBeenCalled();
  });
});
