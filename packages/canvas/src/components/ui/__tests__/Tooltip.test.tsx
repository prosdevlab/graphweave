import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("shows tooltip content on hover", async () => {
    render(
      <Tooltip content="Help text">
        <button type="button">Target</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button", { name: "Target" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Help text");
  });

  it("supports ReactNode content", async () => {
    render(
      <Tooltip content={<div>Rich content</div>}>
        <button type="button">Target</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button", { name: "Target" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Rich content",
    );
  });
});
