import { describe, expect, it } from "vitest";
import { deduplicateOutputKey, isAutoOutputKey } from "../nodeDefaults";

describe("deduplicateOutputKey", () => {
  it("returns as-is when no collision", () => {
    expect(deduplicateOutputKey("tool_result", new Set())).toBe("tool_result");
  });

  it("returns as-is when key not in existing set", () => {
    expect(deduplicateOutputKey("tool_result", new Set(["other_key"]))).toBe(
      "tool_result",
    );
  });

  it("appends _2 on first collision", () => {
    expect(deduplicateOutputKey("tool_result", new Set(["tool_result"]))).toBe(
      "tool_result_2",
    );
  });

  it("appends _3 when _2 is also taken", () => {
    expect(
      deduplicateOutputKey(
        "tool_result",
        new Set(["tool_result", "tool_result_2"]),
      ),
    ).toBe("tool_result_3");
  });

  it("handles empty set", () => {
    expect(deduplicateOutputKey("anything", new Set())).toBe("anything");
  });
});

describe("isAutoOutputKey", () => {
  it('returns true for "tool_result"', () => {
    expect(isAutoOutputKey("tool_result")).toBe(true);
  });

  it('returns true for "tool_result_2"', () => {
    expect(isAutoOutputKey("tool_result_2")).toBe(true);
  });

  it('returns true for "tool_result_99"', () => {
    expect(isAutoOutputKey("tool_result_99")).toBe(true);
  });

  it("returns true for prev-tool-derived name", () => {
    expect(isAutoOutputKey("web_search_result", "web_search")).toBe(true);
  });

  it("returns true for prev-tool-derived name with suffix", () => {
    expect(isAutoOutputKey("web_search_result_2", "web_search")).toBe(true);
  });

  it("returns false for different prev tool name", () => {
    expect(isAutoOutputKey("web_search_result", "weather")).toBe(false);
  });

  it("returns false for user-named key without prev tool", () => {
    expect(isAutoOutputKey("api_result")).toBe(false);
  });

  it("returns false for user-named key", () => {
    expect(isAutoOutputKey("search_data")).toBe(false);
  });

  it("returns false for arbitrary _result name without matching prev tool", () => {
    expect(isAutoOutputKey("custom_result")).toBe(false);
  });
});
