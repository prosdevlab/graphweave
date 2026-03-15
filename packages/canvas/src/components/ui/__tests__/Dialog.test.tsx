import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "../Dialog";

// jsdom doesn't support native <dialog> methods
HTMLDialogElement.prototype.showModal =
  HTMLDialogElement.prototype.showModal || vi.fn();
HTMLDialogElement.prototype.close =
  HTMLDialogElement.prototype.close || vi.fn();

describe("Dialog", () => {
  it("renders title and children when open", () => {
    render(
      <Dialog open onClose={vi.fn()} title="Test Dialog">
        <p>Content</p>
      </Dialog>,
    );
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Close Test">
        <p>Body</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders content when open is false (dialog element controls visibility)", () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Hidden">
        <p>Hidden content</p>
      </Dialog>,
    );
    // Content is in the DOM but dialog is not shown (controlled by native <dialog>)
    expect(screen.getByText("Hidden content")).toBeInTheDocument();
  });
});
