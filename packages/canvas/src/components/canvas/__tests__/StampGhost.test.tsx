import { render, screen } from "@testing-library/react";
import { StampGhost } from "../StampGhost";

let mockStampNodeType: string | null = null;

vi.mock("@contexts/CanvasContext", () => ({
  useCanvasContext: () => ({
    stampNodeType: mockStampNodeType,
  }),
}));

describe("StampGhost", () => {
  afterEach(() => {
    mockStampNodeType = null;
  });

  it("renders nothing visible when stampNodeType is null", () => {
    mockStampNodeType = null;
    const { container } = render(<StampGhost />);
    expect(screen.queryByTestId("stamp-ghost")).not.toBeInTheDocument();
    // Only the hidden ref div
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("hidden");
  });

  it("has pointer-events: none container when stamp is set", () => {
    mockStampNodeType = "llm";
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <StampGhost />
      </div>,
    );
    const ghostContainer = container.querySelector(".pointer-events-none");
    expect(ghostContainer).toBeInTheDocument();
  });
});
