import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sheet } from "../Sheet";

describe("Sheet", () => {
  it("renders title and children when open", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Config">
        <p>Sheet content</p>
      </Sheet>,
    );
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Sheet content")).toBeInTheDocument();
  });

  it("applies translate-x-0 when open", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Open">
        <p>Body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("translate-x-0");
  });

  it("applies translate-x-full when closed (right side)", () => {
    render(
      <Sheet open={false} onClose={vi.fn()} title="Closed">
        <p>Body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    expect(dialog).toHaveClass("translate-x-full");
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Close Test">
        <p>Body</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByLabelText("Close panel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has role dialog and aria-label", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Accessible">
        <p>Body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Accessible");
  });
});
