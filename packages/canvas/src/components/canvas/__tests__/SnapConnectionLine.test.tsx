import { render } from "@testing-library/react";
import { Position } from "@xyflow/react";
import type { ConnectionLineComponentProps } from "@xyflow/react";
import { SnapConnectionLine } from "../SnapConnectionLine";

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    getBezierPath: vi.fn(() => ["M 0 0 C 50 0 50 100 100 100"]),
  };
});

const baseProps: ConnectionLineComponentProps = {
  fromX: 0,
  fromY: 0,
  toX: 100,
  toY: 100,
  fromPosition: Position.Right,
  toPosition: Position.Left,
  connectionLineType: "default" as never,
  connectionStatus: null,
  fromNode: {} as never,
  fromHandle: {} as never,
  toNode: null,
  toHandle: null,
  pointer: { x: 100, y: 100 },
};

describe("SnapConnectionLine", () => {
  it("renders a path element", () => {
    const { container } = render(
      <svg role="img" aria-label="test">
        <SnapConnectionLine {...baseProps} />
      </svg>,
    );
    const path = container.querySelector("path");
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute("d");
  });

  it("renders with correct stroke styling", () => {
    const { container } = render(
      <svg role="img" aria-label="test">
        <SnapConnectionLine {...baseProps} />
      </svg>,
    );
    const path = container.querySelector("path");
    expect(path).toHaveAttribute("stroke", "#52525b");
    expect(path).toHaveAttribute("stroke-width", "2");
    expect(path).toHaveAttribute("fill", "none");
  });

  it("renders without crashing when connectionStatus is valid", () => {
    const { container } = render(
      <svg role="img" aria-label="test">
        <SnapConnectionLine {...baseProps} connectionStatus="valid" />
      </svg>,
    );
    expect(container.querySelector("path")).toBeInTheDocument();
  });
});
