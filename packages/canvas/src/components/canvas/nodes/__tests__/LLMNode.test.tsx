import { render, screen } from "@testing-library/react";
import { LLMNode } from "../LLMNode";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Left: "left", Right: "right" },
}));

const defaultProps = {
  id: "2",
  data: {
    label: "Chat",
    config: {
      provider: "openai",
      model: "gpt-4o",
      system_prompt: "",
      temperature: 0.7,
      max_tokens: 1024,
      input_map: {},
      output_key: "result",
    },
  },
  selected: false,
} as unknown as Parameters<typeof LLMNode>[0];

describe("LLMNode", () => {
  it('renders with "LLM" badge and label', () => {
    render(<LLMNode {...defaultProps} />);
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
  });

  it("shows provider badge and model name", () => {
    render(<LLMNode {...defaultProps} />);
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("has both handles", () => {
    render(<LLMNode {...defaultProps} />);
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();
  });

  it("applies llm accent class", () => {
    const { container } = render(<LLMNode {...defaultProps} />);
    expect(container.firstChild).toHaveClass("gw-node-llm");
  });
});
