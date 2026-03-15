import { render, screen } from "@testing-library/react";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
  it("renders children", () => {
    render(
      <Tooltip content="Hint">
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    expect(
      screen.getByRole("button", { name: "Hover me" }),
    ).toBeInTheDocument();
  });

  it("tooltip text has role tooltip", () => {
    render(
      <Tooltip content="Help text">
        <span>Target</span>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Help text");
  });

  it("tooltip is hidden by default (opacity-0)", () => {
    render(
      <Tooltip content="Hidden">
        <span>Target</span>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip")).toHaveClass("opacity-0");
  });

  it("applies correct side class for right (default)", () => {
    render(
      <Tooltip content="Right">
        <span>Target</span>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip")).toHaveClass("left-full");
  });

  it("applies correct side class for top", () => {
    render(
      <Tooltip content="Top" side="top">
        <span>Target</span>
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip")).toHaveClass("bottom-full");
  });
});
