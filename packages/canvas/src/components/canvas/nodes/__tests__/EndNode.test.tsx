import { render, screen } from "@testing-library/react";
import { EndNode } from "../EndNode";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Left: "left", Right: "right" },
}));

const defaultProps = {
  id: "3",
  data: { label: "End" },
  selected: false,
} as unknown as Parameters<typeof EndNode>[0];

describe("EndNode", () => {
  it("renders with label", () => {
    render(<EndNode {...defaultProps} />);
    expect(screen.getByText("End")).toBeInTheDocument();
  });

  it("has target handle but no source handle", () => {
    render(<EndNode {...defaultProps} />);
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-source")).not.toBeInTheDocument();
  });

  it("applies end accent class", () => {
    const { container } = render(<EndNode {...defaultProps} />);
    expect(container.firstChild).toHaveClass("gw-node-end");
  });
});
