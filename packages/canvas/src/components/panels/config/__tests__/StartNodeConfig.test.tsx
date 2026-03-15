import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartNodeConfig } from "../StartNodeConfig";

const mockNode = { label: "Start" };

describe("StartNodeConfig", () => {
  it("renders label input with current value", () => {
    render(<StartNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Start")).toBeInTheDocument();
  });

  it("changing label calls onChange with { label }", async () => {
    const onChange = vi.fn();
    render(<StartNodeConfig node={mockNode} onChange={onChange} />);
    const input = screen.getByDisplayValue("Start");
    await userEvent.type(input, "X");
    expect(onChange).toHaveBeenLastCalledWith({ label: "StartX" });
  });

  it("shows description text about entry point", () => {
    render(<StartNodeConfig node={mockNode} onChange={vi.fn()} />);
    expect(screen.getByText(/entry point/i)).toBeInTheDocument();
  });
});
