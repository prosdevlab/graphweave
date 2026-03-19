import type { LLMNode } from "@shared/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LLMNodeConfig } from "../LLMNodeConfig";

// Default store state — tests can override via mockGraphStore
const defaultGraphStore = {
  graph: {
    state: [
      { key: "messages", type: "list", reducer: "append", readonly: true },
      { key: "llm_response", type: "string", reducer: "replace" },
      { key: "user_input", type: "string", reducer: "replace" },
    ],
  },
  nodes: [] as unknown[],
  edges: [] as unknown[],
};

let graphStoreOverride: typeof defaultGraphStore | null = null;

vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector(graphStoreOverride ?? defaultGraphStore),
}));

vi.mock("@store/settingsSlice", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      providers: null,
      loadProviders: vi.fn(),
    }),
}));

const mockNode: LLMNode = {
  id: "llm-1",
  type: "llm",
  label: "Chat",
  position: { x: 0, y: 0 },
  config: {
    provider: "openai",
    model: "gpt-4o",
    system_prompt: "You are helpful.",
    temperature: 0.7,
    max_tokens: 1024,
    input_map: {},
    output_key: "llm_response",
  },
};

afterEach(() => {
  graphStoreOverride = null;
});

describe("LLMNodeConfig", () => {
  it("renders label and system prompt", () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Chat")).toBeInTheDocument();
    expect(screen.getByDisplayValue("You are helpful.")).toBeInTheDocument();
  });

  it("model settings section is collapsible", async () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    // Model settings should start collapsed (provider + model are set)
    expect(screen.queryByText("openai")).not.toBeInTheDocument();
    // Click to expand
    await userEvent.click(screen.getByText("Model Settings"));
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("changing provider updates model options", async () => {
    const onChange = vi.fn();
    render(<LLMNodeConfig node={mockNode} onChange={onChange} />);
    await userEvent.click(screen.getByText("Model Settings"));
    // Click provider trigger to open dropdown
    const triggers = screen.getAllByRole("combobox");
    expect(triggers.length).toBeGreaterThan(0);
    fireEvent.pointerDown(triggers[0] as HTMLElement, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    // Click the "anthropic" option in the listbox
    const anthropicOption = screen.getByRole("option", { name: "anthropic" });
    fireEvent.click(anthropicOption);
    expect(onChange).toHaveBeenCalledWith({
      config: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    });
  });

  it("shows suggestion chips when upstream fields exist", () => {
    // Default store has user_input and llm_response — both appear as chips
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(
      screen.queryByText(/no mappings configured/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("user_input")).toBeInTheDocument();
  });

  it("shows suggestion chips from upstream tool output", () => {
    graphStoreOverride = {
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "tool_result", type: "object", reducer: "replace" },
          { key: "user_input", type: "string", reducer: "replace" },
        ],
      },
      nodes: [
        {
          id: "tool-1",
          type: "tool",
          label: "Search",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "search",
            input_map: {},
            output_key: "tool_result",
          },
        },
        mockNode,
      ],
      edges: [{ id: "e1", source: "tool-1", target: "llm-1" }],
    };
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByText("tool_result")).toBeInTheDocument();
  });

  it("clicking suggestion creates a persisted mapping row", async () => {
    graphStoreOverride = {
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "tool_result", type: "object", reducer: "replace" },
        ],
      },
      nodes: [
        {
          id: "tool-1",
          type: "tool",
          label: "Search",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "search",
            input_map: {},
            output_key: "tool_result",
          },
        },
        mockNode,
      ],
      edges: [{ id: "e1", source: "tool-1", target: "llm-1" }],
    };
    const onChange = vi.fn();
    render(<LLMNodeConfig node={mockNode} onChange={onChange} />);
    await userEvent.click(screen.getByText("tool_result"));
    expect(onChange).toHaveBeenCalledWith({
      config: { input_map: { tool_result: "tool_result" } },
    });
    // Expanded editor should show the row
    expect(screen.getByPlaceholderText("param_name")).toBeInTheDocument();
  });

  it("suggestions disappear after clicking one", async () => {
    graphStoreOverride = {
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "tool_result", type: "object", reducer: "replace" },
          { key: "user_input", type: "string", reducer: "replace" },
        ],
      },
      nodes: [
        {
          id: "tool-1",
          type: "tool",
          label: "Search",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "search",
            input_map: {},
            output_key: "tool_result",
          },
        },
        mockNode,
      ],
      edges: [{ id: "e1", source: "tool-1", target: "llm-1" }],
    };
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    // Both chips visible initially
    expect(screen.getByText("tool_result")).toBeInTheDocument();
    expect(screen.getByText("user_input")).toBeInTheDocument();
    await userEvent.click(screen.getByText("tool_result"));
    // Chips are gone — now in expanded edit mode
    expect(
      screen.queryByText(/these fields are also available/i),
    ).not.toBeInTheDocument();
  });

  it("does not show messages content as suggestion chip", () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.queryByText("User's message")).not.toBeInTheDocument();
    expect(screen.queryByText("messages[-1].content")).not.toBeInTheDocument();
  });

  it("shows 'No mappings' when no relevant fields beyond messages", () => {
    graphStoreOverride = {
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
        ],
      },
      nodes: [],
      edges: [],
    };
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByText(/no mappings configured/i)).toBeInTheDocument();
  });

  it("add mapping button creates a new row", async () => {
    const onChange = vi.fn();
    render(<LLMNodeConfig node={mockNode} onChange={onChange} />);
    await userEvent.click(screen.getByText(/add mapping/i));
    expect(screen.getByPlaceholderText("param_name")).toBeInTheDocument();
  });

  it("hides output_key for terminal nodes (no outgoing edges)", () => {
    // mockNode has no edges → isTerminalNode returns true → output_key hidden
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.queryByText("Result saved to")).not.toBeInTheDocument();
  });

  it("does not show number or boolean fields as suggestion chips", () => {
    graphStoreOverride = {
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "counter", type: "number", reducer: "replace" },
          { key: "is_active", type: "boolean", reducer: "replace" },
        ],
      },
      nodes: [],
      edges: [],
    };
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.queryByText("counter")).not.toBeInTheDocument();
    expect(screen.queryByText("is_active")).not.toBeInTheDocument();
  });

  it("shows object-typed tool output as suggestion chip", () => {
    graphStoreOverride = {
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "tool_result", type: "object", reducer: "replace" },
        ],
      },
      nodes: [
        {
          id: "tool-1",
          type: "tool",
          label: "Search",
          position: { x: 0, y: 0 },
          config: {
            tool_name: "search",
            input_map: {},
            output_key: "tool_result",
          },
        },
        mockNode,
      ],
      edges: [{ id: "e1", source: "tool-1", target: "llm-1" }],
    };
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByText("tool_result")).toBeInTheDocument();
  });

  it("renders with existing input_map rows", () => {
    const nodeWithMap: LLMNode = {
      ...mockNode,
      config: {
        ...mockNode.config,
        input_map: { context: "tool_result" },
      },
    };
    render(<LLMNodeConfig node={nodeWithMap} onChange={vi.fn()} />);
    expect(screen.getByText("context")).toBeInTheDocument();
  });
});
