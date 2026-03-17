import { render, screen } from "@testing-library/react";
import { Play } from "lucide-react";
import { BaseNodeShell } from "../BaseNodeShell";

vi.mock("@xyflow/react", () => ({
  Handle: ({
    type,
    position,
  }: { type: string; position: string; className?: string }) => (
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
  label: "My Node",
  icon: Play,
  accentClass: "gw-node-start",
  iconColor: "text-emerald-400",
  selected: false,
};

describe("BaseNodeShell", () => {
  it("renders label", () => {
    render(<BaseNodeShell {...defaultProps} />);
    expect(screen.getByText("My Node")).toBeInTheDocument();
  });

  it("renders both handles by default", () => {
    render(<BaseNodeShell {...defaultProps} />);
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();
  });

  it("omits target handle when targetHandle=false", () => {
    render(<BaseNodeShell {...defaultProps} targetHandle={false} />);
    expect(screen.queryByTestId("handle-target")).not.toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();
  });

  it("omits source handle when sourceHandle=false", () => {
    render(<BaseNodeShell {...defaultProps} sourceHandle={false} />);
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-source")).not.toBeInTheDocument();
  });

  it("applies selected class when selected=true", () => {
    const { container } = render(
      <BaseNodeShell {...defaultProps} selected={true} />,
    );
    expect(container.firstChild).toHaveClass("gw-node-selected");
  });

  it("renders children in content area", () => {
    render(
      <BaseNodeShell {...defaultProps}>
        <span>Extra content</span>
      </BaseNodeShell>,
    );
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
