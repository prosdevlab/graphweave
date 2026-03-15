import { render, screen } from "@testing-library/react";
import { CanvasHint } from "../CanvasHint";

describe("CanvasHint", () => {
  it("renders hint text when nodeCount <= 2", () => {
    render(<CanvasHint nodeCount={2} />);
    expect(
      screen.getByText("Drag nodes from the toolbar to build your graph"),
    ).toBeInTheDocument();
  });

  it("renders nothing when nodeCount > 2", () => {
    const { container } = render(<CanvasHint nodeCount={3} />);
    expect(container.firstChild).toBeNull();
  });
});
