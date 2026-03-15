import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LLMNodeConfig } from "../LLMNodeConfig";

const mockNode = {
  label: "Chat",
  config: {
    provider: "openai",
    model: "gpt-4o",
    system_prompt: "You are helpful.",
    temperature: 0.7,
    max_tokens: 1024,
    input_map: {},
    output_key: "result",
  },
};

describe("LLMNodeConfig", () => {
  it("renders all fields", () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Chat")).toBeInTheDocument();
    expect(screen.getByDisplayValue("openai")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gpt-4o")).toBeInTheDocument();
    expect(screen.getByDisplayValue("You are helpful.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0.7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1024")).toBeInTheDocument();
  });

  it("changing provider updates model options", async () => {
    const onChange = vi.fn();
    render(<LLMNodeConfig node={mockNode} onChange={onChange} />);
    const providerSelect = screen.getByDisplayValue("openai");
    await userEvent.selectOptions(providerSelect, "anthropic");
    expect(onChange).toHaveBeenCalledWith({
      config: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    });
  });

  it("changing temperature calls onChange with config update", async () => {
    const onChange = vi.fn();
    render(<LLMNodeConfig node={mockNode} onChange={onChange} />);
    const tempInput = screen.getByDisplayValue("0.7");
    await userEvent.type(tempInput, "5");
    // Input value becomes "0.75" — last call has the final parsed value
    expect(onChange).toHaveBeenLastCalledWith({
      config: { temperature: 0.75 },
    });
  });

  it("system prompt textarea renders with current value", () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    const textarea = screen.getByDisplayValue("You are helpful.");
    expect(textarea.tagName).toBe("TEXTAREA");
  });

  it("shows state wiring info text", () => {
    render(<LLMNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByText(/state wiring/i)).toBeInTheDocument();
  });
});
