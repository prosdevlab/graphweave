import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText("Card body")).toBeInTheDocument();
  });

  it("applies interactive hover classes when interactive=true", () => {
    render(<Card interactive>Interactive</Card>);
    const card = screen.getByText("Interactive").closest("div");
    expect(card).toHaveClass("cursor-pointer");
    expect(card).toHaveClass("hover:border-zinc-600");
  });

  it("does not apply interactive classes by default", () => {
    render(<Card>Static</Card>);
    const card = screen.getByText("Static").closest("div");
    expect(card).not.toHaveClass("cursor-pointer");
  });

  it("renders CardHeader, CardContent, CardFooter in order", () => {
    render(
      <Card>
        <CardHeader>Header</CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("forwards ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(<Card ref={ref}>Ref card</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
