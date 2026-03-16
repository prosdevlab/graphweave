import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGraphDialog } from "../NewGraphDialog";

HTMLDialogElement.prototype.showModal ??= vi.fn(function (
  this: HTMLDialogElement,
) {
  this.setAttribute("open", "");
});
HTMLDialogElement.prototype.close ??= vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

const mockNewGraph = vi.fn();
const mockSaveGraph = vi.fn(() => Promise.resolve());
const mockSetOpen = vi.fn();
const mockNavigate = vi.fn();

let mockOpen = true;
let mockGraph: { id: string } | null = { id: "test-id" };

vi.mock("@store/graphSlice", () => ({
  useGraphStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        newGraph: mockNewGraph,
        saveGraph: mockSaveGraph,
      }),
    {
      getState: () => ({ graph: mockGraph }),
    },
  ),
}));

vi.mock("@store/uiSlice", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      newGraphDialogOpen: mockOpen,
      setNewGraphDialogOpen: mockSetOpen,
    }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  mockOpen = true;
  mockGraph = { id: "test-id" };
  vi.clearAllMocks();
  mockSaveGraph.mockResolvedValue(undefined);
});

describe("NewGraphDialog", () => {
  it("renders dialog when open", () => {
    render(<NewGraphDialog />);
    expect(screen.getByText("Create a new graph")).toBeInTheDocument();
  });

  it("does not call showModal when closed", () => {
    mockOpen = false;
    render(<NewGraphDialog />);
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });

  it("calls newGraph with entered name on Create Graph click", async () => {
    render(<NewGraphDialog />);
    await userEvent.type(screen.getByPlaceholderText("My Graph"), "Test Flow");
    await userEvent.click(screen.getByRole("button", { name: "Create Graph" }));
    expect(mockNewGraph).toHaveBeenCalledWith("Test Flow");
  });

  it("calls saveGraph after newGraph", async () => {
    render(<NewGraphDialog />);
    await userEvent.type(screen.getByPlaceholderText("My Graph"), "Flow");
    await userEvent.click(screen.getByRole("button", { name: "Create Graph" }));
    expect(mockNewGraph).toHaveBeenCalledOnce();
    expect(mockSaveGraph).toHaveBeenCalledOnce();
  });

  it("navigates to graph after save", async () => {
    render(<NewGraphDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Create Graph" }));
    expect(mockNavigate).toHaveBeenCalledWith("/graph/test-id");
  });

  it('uses "Untitled Graph" when name is empty', async () => {
    render(<NewGraphDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Create Graph" }));
    expect(mockNewGraph).toHaveBeenCalledWith("Untitled Graph");
  });

  it("Enter key triggers create", async () => {
    render(<NewGraphDialog />);
    const input = screen.getByPlaceholderText("My Graph");
    await userEvent.type(input, "Quick{Enter}");
    expect(mockNewGraph).toHaveBeenCalledWith("Quick");
    expect(mockSaveGraph).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/graph/test-id");
  });
});
