import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "../Sidebar";

function renderSidebar(defaultCollapsed = false) {
  return render(
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <Sidebar>
        <SidebarContent>
          <span>Items</span>
        </SidebarContent>
        <SidebarFooter>
          <SidebarTrigger />
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>,
  );
}

describe("Sidebar", () => {
  it("renders children", () => {
    renderSidebar();
    expect(screen.getByText("Items")).toBeInTheDocument();
  });

  it("default width is w-48 (expanded)", () => {
    renderSidebar();
    const aside = screen.getByRole("complementary");
    expect(aside).toHaveClass("w-48");
  });

  it("collapsed width is w-12", () => {
    renderSidebar(true);
    const aside = screen.getByRole("complementary");
    expect(aside).toHaveClass("w-12");
  });

  it("SidebarTrigger toggles collapsed state", async () => {
    renderSidebar();
    const aside = screen.getByRole("complementary");
    expect(aside).toHaveClass("w-48");

    const trigger = screen.getByLabelText("Collapse sidebar");
    await userEvent.click(trigger);
    expect(aside).toHaveClass("w-12");

    const expandTrigger = screen.getByLabelText("Expand sidebar");
    await userEvent.click(expandTrigger);
    expect(aside).toHaveClass("w-48");
  });
});
