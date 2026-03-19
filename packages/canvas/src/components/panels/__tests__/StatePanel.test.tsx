import type { NodeSchema, StateField } from "@shared/schema";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatePanel } from "../StatePanel";

// Mock CanvasContext
const mockSetSelectedNodeId = vi.fn();
const mockSetStatePanelOpen = vi.fn();
vi.mock("@contexts/CanvasContext", () => ({
  useCanvasContext: () => ({
    statePanelOpen: true,
    setStatePanelOpen: mockSetStatePanelOpen,
    setSelectedNodeId: mockSetSelectedNodeId,
  }),
}));

// Mock graphSlice
const mockAddStateFields = vi.fn();
const mockRemoveStateFields = vi.fn();
let mockState: StateField[] = [];
let mockNodes: NodeSchema[] = [];

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      graph: { state: mockState },
      nodes: mockNodes,
      addStateFields: mockAddStateFields,
      removeStateFields: mockRemoveStateFields,
    }),
  DEFAULT_FIELD_KEYS: new Set(["messages", "user_input", "llm_response"]),
}));

const DEFAULT_FIELDS: StateField[] = [
  { key: "messages", type: "list", reducer: "append", readonly: true },
  { key: "user_input", type: "string", reducer: "replace" },
  { key: "llm_response", type: "string", reducer: "replace" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockState = [...DEFAULT_FIELDS];
  mockNodes = [];
});

describe("StatePanel", () => {
  it("renders all state fields", () => {
    render(<StatePanel />);
    expect(screen.getByText("messages")).toBeInTheDocument();
    expect(screen.getByText("user_input")).toBeInTheDocument();
    expect(screen.getByText("llm_response")).toBeInTheDocument();
  });

  it("shows empty hint when no fields exist", () => {
    mockState = [];
    render(<StatePanel />);
    expect(screen.getByText(/no state fields yet/i)).toBeInTheDocument();
  });

  it("shows readonly badge on readonly fields", () => {
    render(<StatePanel />);
    expect(screen.getByText("RO")).toBeInTheDocument();
  });

  it("hides delete button for readonly fields", () => {
    render(<StatePanel />);
    expect(screen.queryByLabelText("Delete messages")).not.toBeInTheDocument();
  });

  it("shows delete button for non-readonly fields", () => {
    render(<StatePanel />);
    expect(screen.getByLabelText("Delete user_input")).toBeInTheDocument();
  });

  it("calls removeStateFields when delete is clicked", () => {
    render(<StatePanel />);
    fireEvent.click(screen.getByLabelText("Delete user_input"));
    expect(mockRemoveStateFields).toHaveBeenCalledWith(["user_input"]);
  });

  it("shows undo toast after delete", () => {
    render(<StatePanel />);
    fireEvent.click(screen.getByLabelText("Delete user_input"));
    expect(screen.getByText(/removed field/i)).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("undo toast disappears after 5 seconds", () => {
    vi.useFakeTimers();
    render(<StatePanel />);
    fireEvent.click(screen.getByLabelText("Delete user_input"));
    expect(screen.getByText("Undo")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("undo restores the deleted field", () => {
    render(<StatePanel />);
    fireEvent.click(screen.getByLabelText("Delete user_input"));
    fireEvent.click(screen.getByText("Undo"));
    expect(mockAddStateFields).toHaveBeenCalledWith([
      { key: "user_input", type: "string", reducer: "replace" },
    ]);
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  it("shows confirm dialog when deleting a field with usage", () => {
    mockNodes = [
      {
        id: "llm-1",
        type: "llm",
        label: "Chat",
        position: { x: 0, y: 0 },
        config: {
          provider: "openai",
          model: "gpt-4o",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: { prompt: "user_input" },
          output_key: "llm_response",
        },
      } as NodeSchema,
    ];
    render(<StatePanel />);
    fireEvent.click(screen.getByLabelText("Delete user_input"));
    // First click shows confirmation, not delete
    expect(mockRemoveStateFields).not.toHaveBeenCalled();
    expect(screen.getByText(/referenced by nodes/i)).toBeInTheDocument();
    // Click "Remove anyway" to actually delete
    fireEvent.click(screen.getByText("Remove anyway"));
    expect(mockRemoveStateFields).toHaveBeenCalledWith(["user_input"]);
  });

  it("adds a new field via AddFieldForm", async () => {
    render(<StatePanel />);
    const input = screen.getByPlaceholderText("field_name");
    await userEvent.type(input, "custom_data");
    fireEvent.click(screen.getByText("Add field"));
    expect(mockAddStateFields).toHaveBeenCalledWith([
      { key: "custom_data", type: "string", reducer: "replace" },
    ]);
  });

  it("clicking a writer node name calls setSelectedNodeId", () => {
    mockNodes = [
      {
        id: "llm-1",
        type: "llm",
        label: "ChatBot",
        position: { x: 0, y: 0 },
        config: {
          provider: "openai",
          model: "gpt-4o",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: {},
          output_key: "llm_response",
        },
      } as NodeSchema,
    ];
    render(<StatePanel />);
    // llm_response is written by "ChatBot" node — click the usage link
    const writerLinks = screen.getAllByText(/ChatBot/);
    fireEvent.click(writerLinks[0] as HTMLElement);
    expect(mockSetSelectedNodeId).toHaveBeenCalledWith("llm-1");
  });
});
