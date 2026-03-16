import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GraphCard } from "../GraphCard";

describe("GraphCard", () => {
  const now = new Date().toISOString();

  it("renders graph name", () => {
    render(
      <GraphCard
        name="My Graph"
        nodeCount={3}
        updatedAt={now}
        onClick={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(screen.getByText("My Graph")).toBeInTheDocument();
  });

  it("renders node count", () => {
    render(
      <GraphCard
        name="G"
        nodeCount={5}
        updatedAt={now}
        onClick={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(screen.getByText("5 nodes")).toBeInTheDocument();
  });

  it("renders relative time", () => {
    render(
      <GraphCard
        name="G"
        nodeCount={2}
        updatedAt={now}
        onClick={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(
      <GraphCard
        name="G"
        nodeCount={2}
        updatedAt={now}
        onClick={onClick}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText("G"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders mini preview dots", () => {
    const { container } = render(
      <GraphCard
        name="G"
        nodeCount={4}
        updatedAt={now}
        onClick={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    // start (green) + 2 middle (blue) + end (red)
    const greenDots = container.querySelectorAll(".bg-emerald-500\\/60");
    const indigoDots = container.querySelectorAll(".bg-indigo-500\\/60");
    const redDots = container.querySelectorAll(".bg-red-500\\/60");
    expect(greenDots).toHaveLength(1);
    expect(indigoDots).toHaveLength(2); // min(4-2, 3) = 2
    expect(redDots).toHaveLength(1);
  });
});
