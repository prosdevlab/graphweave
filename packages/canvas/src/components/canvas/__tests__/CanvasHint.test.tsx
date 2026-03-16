import { render, screen } from "@testing-library/react";
import { CanvasHint } from "../CanvasHint";

describe("CanvasHint", () => {
  it("renders hint text when nodeCount <= 2", () => {
    render(<CanvasHint nodeCount={2} />);
    expect(
      screen.getByText(
        "Click a node in the toolbar, then click to place — or drag it onto the canvas",
      ),
    ).toBeInTheDocument();
  });

  it("renders nothing when nodeCount > 2", () => {
    const { container } = render(<CanvasHint nodeCount={3} />);
    expect(container.firstChild).toBeNull();
  });
});
