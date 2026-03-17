import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Combobox } from "../Combobox";

describe("Combobox", () => {
  it("typing custom value calls onChange (free-text always works)", async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        value=""
        onChange={onChange}
        options={["alpha", "beta"]}
        placeholder="Type here"
      />,
    );
    const input = screen.getByPlaceholderText("Type here");
    await userEvent.type(input, "custom");
    expect(onChange).toHaveBeenCalled();
  });

  it("selecting option from dropdown calls onChange with option value", async () => {
    const onChange = vi.fn();
    render(
      <Combobox
        value=""
        onChange={onChange}
        options={["alpha", "beta"]}
        placeholder="Pick one"
      />,
    );
    // Open the dropdown
    const trigger = screen.getByRole("button", { name: "Toggle suggestions" });
    await userEvent.click(trigger);
    // Select an option
    const option = await screen.findByText("alpha");
    await userEvent.click(option);
    expect(onChange).toHaveBeenCalledWith("alpha");
  });

  it("empty options renders as plain input (no dropdown trigger)", () => {
    render(
      <Combobox
        value="test"
        onChange={() => {}}
        options={[]}
        placeholder="Plain input"
      />,
    );
    expect(screen.getByPlaceholderText("Plain input")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Toggle suggestions" }),
    ).not.toBeInTheDocument();
  });
});
