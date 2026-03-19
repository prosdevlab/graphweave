import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddFieldForm } from "../AddFieldForm";

const mockOnAdd = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

async function openSelectAndChoose(label: string, optionText: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await act(async () => {
    fireEvent.click(trigger);
  });
  const option = await screen.findByRole("option", { name: optionText });
  await act(async () => {
    fireEvent.click(option);
  });
}

describe("AddFieldForm smart defaults", () => {
  it("auto-sets reducer to append when type is list", async () => {
    render(<AddFieldForm existingKeys={new Set()} onAdd={mockOnAdd} />);
    await openSelectAndChoose("Field type", "list");

    const reducerTrigger = screen.getByRole("combobox", {
      name: "When updated",
    });
    expect(reducerTrigger).toHaveTextContent("Append");
  });

  it("auto-sets reducer to merge when type is object", async () => {
    render(<AddFieldForm existingKeys={new Set()} onAdd={mockOnAdd} />);
    await openSelectAndChoose("Field type", "object");

    const reducerTrigger = screen.getByRole("combobox", {
      name: "When updated",
    });
    expect(reducerTrigger).toHaveTextContent("Merge");
  });

  it("allows manual reducer override after auto-set", async () => {
    render(<AddFieldForm existingKeys={new Set()} onAdd={mockOnAdd} />);

    // Set type to list → auto-sets reducer to append
    await openSelectAndChoose("Field type", "list");
    // Manually override reducer to replace
    await openSelectAndChoose("When updated", "Replace");

    // Fill in name and submit
    const input = screen.getByPlaceholderText("field_name");
    await userEvent.type(input, "my_field");
    fireEvent.click(screen.getByText("Add field"));

    expect(mockOnAdd).toHaveBeenCalledWith({
      key: "my_field",
      type: "list",
      reducer: "replace",
    });
  });
});
