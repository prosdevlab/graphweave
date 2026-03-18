import type { LLMNode } from "@shared/schema";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LLMNodeConfig } from "../LLMNodeConfig";

// Mock graphSlice — LLMNodeConfig reads stateFields, nodes, edges
vi.mock("@store/graphSlice", () => ({
  useGraphStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      graph: {
        state: [
          { key: "messages", type: "list", reducer: "append", readonly: true },
          { key: "llm_response", type: "string", reducer: "replace" },
          { key: "user_input", type: "string", reducer: "replace" },
        ],
      },
      nodes: [],
      edges: [],
    }),
}));

// Mock settingsSlice — LLMNodeConfig reads providers
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

describe("LLMNodeConfig", () => {
  it("renders label and system prompt", () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Chat")).toBeInTheDocument();
    expect(screen.getByDisplayValue("You are helpful.")).toBeInTheDocument();
  });

  it("model settings section is collapsible", async () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    // Model settings should start collapsed (provider + model are set)
    expect(screen.queryByDisplayValue("openai")).not.toBeInTheDocument();
    // Click to expand
    await userEvent.click(screen.getByText("Model Settings"));
    expect(screen.getByDisplayValue("openai")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-4o")).toBeInTheDocument();
  });

  it("changing provider updates model options", async () => {
    const onChange = vi.fn();
    render(<LLMNodeConfig node={mockNode} onChange={onChange} />);
    await userEvent.click(screen.getByText("Model Settings"));
    const providerSelect = screen.getByDisplayValue("openai");
    await userEvent.selectOptions(providerSelect, "anthropic");
    expect(onChange).toHaveBeenCalledWith({
      config: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    });
  });

  it("shows empty input_map hint when no mappings", () => {
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
