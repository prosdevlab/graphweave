import type { NodeSchema, StateField } from "@shared/schema";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatePanel } from "../StatePanel";

// Mock CanvasContext
const mockSetSelectedNodeId = vi.fn();
vi.mock("@contexts/CanvasContext", () => ({
  useCanvasContext: () => ({
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
    // ChatBot appears in both llm_response and messages rows (dual-write)
    const chatBotButtons = screen.getAllByText("ChatBot");
    fireEvent.click(chatBotButtons[0] as HTMLElement);
    expect(mockSetSelectedNodeId).toHaveBeenCalledWith("llm-1");
  });

  it("disambiguates duplicate node labels with model name", () => {
    mockNodes = [
      {
        id: "llm-1",
        type: "llm",
        label: "LLM",
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
      {
        id: "llm-2",
        type: "llm",
        label: "LLM",
        position: { x: 200, y: 0 },
        config: {
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: {},
          output_key: "llm_response",
        },
      } as NodeSchema,
    ];
    render(<StatePanel />);
    // Both appear in llm_response and messages rows (dual-write)
    const gpt4oButtons = screen.getAllByText("LLM (gpt-4o)");
    const claudeButtons = screen.getAllByText("LLM (claude-3-5-sonnet)");
    expect(gpt4oButtons.length).toBeGreaterThanOrEqual(1);
    expect(claudeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders readers with arrow and param name", () => {
    mockNodes = [
      {
        id: "llm-1",
        type: "llm",
        label: "Reviewer",
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
    expect(screen.getByText("Reviewer (prompt)")).toBeInTheDocument();
    // Arrow character is rendered in a span (with trailing space)
    expect(screen.getByText(/\u2192/)).toBeInTheDocument();
  });

  it("deduplicates writers for messages field", () => {
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
          input_map: {},
          output_key: "llm_response",
        },
      } as NodeSchema,
    ];
    render(<StatePanel />);
    // Chat writes to both llm_response and messages (dual-write),
    // but should only appear once per field
    const chatButtons = screen.getAllByText("Chat");
    // One for llm_response writer, one for messages writer = 2 total, not 3
    expect(chatButtons).toHaveLength(2);
  });

  it("renders multiple writers comma-separated on one line", () => {
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
          input_map: {},
          output_key: "llm_response",
        },
      } as NodeSchema,
      {
        id: "llm-2",
        type: "llm",
        label: "Summarizer",
        position: { x: 200, y: 0 },
        config: {
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          system_prompt: "",
          temperature: 0.7,
          max_tokens: 1024,
          input_map: {},
          output_key: "llm_response",
        },
      } as NodeSchema,
    ];
    render(<StatePanel />);
    // Both writers should be in the same container with the ← arrow
    const arrowSpan = screen.getAllByText(/\u2190/);
    // llm_response field should have an arrow with both writers
    const llmResponseArrow = arrowSpan.find((el) => {
      const container = el.parentElement;
      return (
        container?.textContent?.includes("Chat") &&
        container?.textContent?.includes("Summarizer")
      );
    });
    expect(llmResponseArrow).toBeDefined();
  });
});
