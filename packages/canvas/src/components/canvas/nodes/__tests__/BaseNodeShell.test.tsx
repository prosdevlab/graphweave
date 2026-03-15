import { render, screen } from "@testing-library/react";
import { Play } from "lucide-react";
import { BaseNodeShell } from "../BaseNodeShell";

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-position={position} />
  ),
  Position: { Left: "left", Right: "right" },
}));

describe("BaseNodeShell", () => {
  it("renders label and type badge", () => {
    render(
      <BaseNodeShell
        label="My Node"
        icon={Play}
        typeLabel="START"
        accentClass="gw-node-start"
        selected={false}
      />,
    );
    expect(screen.getByText("My Node")).toBeInTheDocument();
    expect(screen.getByText("START")).toBeInTheDocument();
  });

  it("renders both handles by default", () => {
    render(
      <BaseNodeShell
        label="Node"
        icon={Play}
        typeLabel="TEST"
        accentClass=""
        selected={false}
      />,
    );
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();
  });

  it("omits target handle when targetHandle=false", () => {
    render(
      <BaseNodeShell
        label="Node"
        icon={Play}
        typeLabel="TEST"
        accentClass=""
        selected={false}
        targetHandle={false}
      />,
    );
    expect(screen.queryByTestId("handle-target")).not.toBeInTheDocument();
    expect(screen.getByTestId("handle-source")).toBeInTheDocument();
  });

  it("omits source handle when sourceHandle=false", () => {
    render(
      <BaseNodeShell
        label="Node"
        icon={Play}
        typeLabel="TEST"
        accentClass=""
        selected={false}
        sourceHandle={false}
      />,
    );
    expect(screen.getByTestId("handle-target")).toBeInTheDocument();
    expect(screen.queryByTestId("handle-source")).not.toBeInTheDocument();
  });

  it("applies selected class when selected=true", () => {
    const { container } = render(
      <BaseNodeShell
        label="Node"
        icon={Play}
        typeLabel="TEST"
        accentClass="gw-node-start"
        selected={true}
      />,
    );
    expect(container.firstChild).toHaveClass("gw-node-selected");
  });

  it("renders children in content area", () => {
    render(
      <BaseNodeShell
        label="Node"
        icon={Play}
        typeLabel="TEST"
        accentClass=""
        selected={false}
      >
        <span>Extra content</span>
      </BaseNodeShell>,
    );
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });
});
