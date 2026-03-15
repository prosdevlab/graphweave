import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CanvasHeader } from "../CanvasHeader";

const mockSetView = vi.fn();
const mockSaveGraph = vi.fn();
const mockRenameGraph = vi.fn();

let mockGraph: { name: string } | null = { name: "Test Graph" };
let mockDirty = false;
let mockSaving = false;
let mockSaveError: string | null = null;

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      graph: mockGraph,
      dirty: mockDirty,
      saving: mockSaving,
      saveError: mockSaveError,
      saveGraph: mockSaveGraph,
      renameGraph: mockRenameGraph,
    }),
}));

vi.mock("@store/uiSlice", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      setView: mockSetView,
    }),
}));

beforeEach(() => {
  mockGraph = { name: "Test Graph" };
  mockDirty = false;
  mockSaving = false;
  mockSaveError = null;
  vi.clearAllMocks();
});

describe("CanvasHeader", () => {
  it("renders GraphWeave back button", () => {
    render(<CanvasHeader />);
    expect(screen.getByText("GraphWeave")).toBeInTheDocument();
  });

  it("shows graph name when graph is loaded", () => {
    render(<CanvasHeader />);
    expect(screen.getByText("Test Graph")).toBeInTheDocument();
  });

  it("clicking name enables inline edit mode", async () => {
    render(<CanvasHeader />);
    await userEvent.click(screen.getByText("Test Graph"));
    expect(screen.getByLabelText("Graph name")).toBeInTheDocument();
  });

  it("typing in edit mode calls renameGraph", async () => {
    render(<CanvasHeader />);
    await userEvent.click(screen.getByText("Test Graph"));
    const input = screen.getByLabelText("Graph name");
    await userEvent.type(input, "X");
    expect(mockRenameGraph).toHaveBeenLastCalledWith("Test GraphX");
  });

  it("shows dirty indicator (*) when dirty", () => {
    mockDirty = true;
    render(<CanvasHeader />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("Save button disabled when not dirty", () => {
    mockDirty = false;
    render(<CanvasHeader />);
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("clicking Save calls saveGraph", async () => {
    mockDirty = true;
    render(<CanvasHeader />);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(mockSaveGraph).toHaveBeenCalledOnce();
  });

  it('shows "Saving..." when saving', () => {
    mockDirty = true;
    mockSaving = true;
    render(<CanvasHeader />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("shows error toast when saveError is set", () => {
    mockSaveError = "Network error";
    render(<CanvasHeader />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network error");
  });

  it("clicking back with dirty state shows confirm dialog", async () => {
    mockDirty = true;
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CanvasHeader />);
    await userEvent.click(screen.getByLabelText("Back to home"));
    expect(window.confirm).toHaveBeenCalled();
    expect(mockSetView).not.toHaveBeenCalled();
  });
});
