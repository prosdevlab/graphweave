import { render, screen } from "@testing-library/react";
import { StartNode } from "../StartNode";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Left: "left", Right: "right" },
  useNodeId: () => "test-node-id",
}));

vi.mock("@store/runSlice", () => ({
  useRunStore: Object.assign(
    (selector: (s: { activeNodeId: string | null }) => unknown) =>
      selector({ activeNodeId: null }),
    { getState: () => ({ activeNodeId: null }) },
  ),
}));

const defaultProps = {
  id: "1",
  data: { label: "Start" },
  selected: false,
} as unknown as Parameters<typeof StartNode>[0];

describe("StartNode", () => {
  it("renders with label", () => {
    render(<StartNode {...defaultProps} />);
    expect(screen.getByText("Start")).toBeInTheDocument();
  });

  it("has source handle but no target handle", () => {
    render(<StartNode {...defaultProps} />);
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-target")).not.toBeInTheDocument();
  });

  it("applies start accent class", () => {
    const { container } = render(<StartNode {...defaultProps} />);
    expect(container.firstChild).toHaveClass("gw-node-start");
  });
});
