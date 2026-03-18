import { render, screen } from "@testing-library/react";
import { RunFormFields } from "../RunFormFields";
import type { FieldHints } from "../runInputUtils";

describe("RunFormFields", () => {
  it("messages field does not use tool-param placeholder", () => {
    const fieldHints: FieldHints = {
      messages: [
        {
          description: "URL to fetch",
          source: "Fetch (url_fetch)",
          placeholder: "URL to fetch",
          examples: [],
        },
      ],
    };

    render(
      <RunFormFields
        inputFields={[{ key: "messages", type: "list", reducer: "append" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
        fieldHints={fieldHints}
      />,
    );

    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("placeholder", "URL to fetch");
  });

  it("messages field shows 'Type your message...' placeholder", () => {
    render(
      <RunFormFields
        inputFields={[{ key: "messages", type: "list", reducer: "append" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
      />,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("placeholder", "Type your message...");
  });

  it("messages field with single hint shows 'Your message is used as the ...'", () => {
    const fieldHints: FieldHints = {
      messages: [
        {
          description: "Search query",
          source: "Search (web_search)",
          examples: [],
        },
      ],
    };

    render(
      <RunFormFields
        inputFields={[{ key: "messages", type: "list", reducer: "append" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
        fieldHints={fieldHints}
      />,
    );

    expect(
      screen.getByText(/Your message is used as the/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/search query/i)).toBeInTheDocument();
    expect(screen.getByText(/Search \(web_search\)/i)).toBeInTheDocument();
  });

  it("messages field with multiple hints shows bulleted list", () => {
    const fieldHints: FieldHints = {
      messages: [
        {
          description: "Search query",
          source: "Search (web_search)",
          examples: [],
        },
        {
          description: "City name",
          source: "Weather (get_weather)",
          examples: [],
        },
      ],
    };

    render(
      <RunFormFields
        inputFields={[{ key: "messages", type: "list", reducer: "append" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
        fieldHints={fieldHints}
      />,
    );

    expect(screen.getByText("Your message is used as:")).toBeInTheDocument();
    expect(
      screen.getByText(/search query.*Search \(web_search\)/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/city name.*Weather \(get_weather\)/i),
    ).toBeInTheDocument();
  });

  it("duplicate sources from the same node are deduplicated in bullet list", () => {
    const fieldHints: FieldHints = {
      messages: [
        {
          description: "URL param",
          source: "Fetch (url_fetch)",
          placeholder: "URL to fetch",
          examples: [],
        },
        {
          description: "Foo param",
          source: "Fetch (url_fetch)",
          placeholder: undefined,
          examples: [],
        },
      ],
    };

    render(
      <RunFormFields
        inputFields={[{ key: "messages", type: "list", reducer: "append" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
        fieldHints={fieldHints}
      />,
    );

    // 2 hints with the same source → deduped to 1 bullet in multi-hint view
    const bullets = screen.getAllByText(/Fetch \(url_fetch\)/);
    expect(bullets).toHaveLength(1);
  });

  it("non-messages field uses tool param description as placeholder", () => {
    const fieldHints: FieldHints = {
      content: [
        {
          description: "Text content to write",
          source: "Write (file_write)",
          placeholder: "Text content to write",
          examples: [],
        },
      ],
    };

    render(
      <RunFormFields
        inputFields={[{ key: "content", type: "string", reducer: "replace" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
        fieldHints={fieldHints}
      />,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("placeholder", "Text content to write");
  });

  it("output keys show writer node label when outputKeyWriters provided", () => {
    render(
      <RunFormFields
        inputFields={[]}
        outputKeys={new Set(["tool_result"])}
        outputKeyWriters={{ tool_result: "Search" }}
        values={{}}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("tool_result")).toBeInTheDocument();
    expect(screen.getByText("← Search")).toBeInTheDocument();
  });

  it("output section header reads 'Produced by the graph'", () => {
    render(
      <RunFormFields
        inputFields={[]}
        outputKeys={new Set(["result"])}
        values={{}}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/Produced by the graph/i)).toBeInTheDocument();
  });

  it("HintSources shows 'Used by' for non-messages fields", () => {
    const fieldHints: FieldHints = {
      url: [
        {
          description: "URL to fetch",
          source: "Fetch (url_fetch)",
          examples: [],
        },
      ],
    };

    render(
      <RunFormFields
        inputFields={[{ key: "url", type: "string", reducer: "replace" }]}
        outputKeys={new Set()}
        values={{}}
        onChange={() => {}}
        fieldHints={fieldHints}
      />,
    );

    expect(
      screen.getByText(/Used by Fetch \(url_fetch\)/i),
    ).toBeInTheDocument();
  });
});
