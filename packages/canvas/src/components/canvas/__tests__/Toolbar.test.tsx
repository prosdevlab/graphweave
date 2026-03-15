import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { SidebarProvider } from "@ui/Sidebar";
import { Toolbar } from "../Toolbar";

function renderToolbar() {
  return render(
    <SidebarProvider>
      <Toolbar />
    </SidebarProvider>,
  );
}

describe("Toolbar", () => {
  it("renders all three node type items", () => {
    renderToolbar();
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
  });

  it("each item is draggable", () => {
    renderToolbar();
    const items = screen.getAllByText(/^(Start|LLM|End)$/);
    for (const item of items) {
      const draggable = item.closest("[draggable]");
      expect(draggable).toHaveAttribute("draggable", "true");
    }
  });

  it("dragStart sets correct data transfer type", () => {
    renderToolbar();
    const startItem = screen.getByText("Start").closest("[draggable]");
    if (!startItem) throw new Error("Start item not found");

    const setData = vi.fn();
    fireEvent.dragStart(startItem, {
      dataTransfer: { setData, effectAllowed: "" },
    });
    expect(setData).toHaveBeenCalledWith(
      "application/graphweave-node-type",
      "start",
    );
  });
});
