import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { Button } from "../Button";

describe("Button", () => {
  it("renders with default variant (secondary)", () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole("button", { name: "Click me" });
    expect(btn).toHaveClass("bg-zinc-800");
  });

  it("renders with primary variant", () => {
    render(<Button variant="primary">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveClass("bg-indigo-600");
  });

  it("renders with ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button", { name: "Ghost" });
    expect(btn).toHaveClass("text-zinc-400");
  });

  it("applies disabled styles and prevents clicks", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Disabled" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass("disabled:opacity-50");
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("spreads additional HTML attributes", () => {
    render(<Button data-testid="custom">Attrs</Button>);
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });

  it("fires click handler", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
