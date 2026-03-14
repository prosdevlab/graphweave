"""Manual test 32: web_search Tavily path — requires TAVILY_API_KEY.

Usage: TAVILY_API_KEY=tvly-... uv run python tests/manual/test_32_web_search_tavily.py
"""

import os
import sys

from app.tools.web_search import WebSearchTool


def main():
    print("── Test 32: web_search Tavily ──")

    if not os.environ.get("TAVILY_API_KEY"):
        print("  ⚠ TAVILY_API_KEY not set — skipping")
        print("  Set TAVILY_API_KEY and re-run.")
        sys.exit(0)

    tool = WebSearchTool()

    result = tool.run({"query": "GraphWeave LangGraph", "max_results": 3})
    assert result["success"] is True, f"Tavily search failed: {result.get('error')}"
    assert result["source"] == "tavily"
    assert len(result["result"]) > 0
    print(f"  ✓ Tavily returned results ({len(result['result'])} chars)")
    print(f"    Preview: {result['result'][:300]}...")

    print("\n✅ Tavily search test passed")


if __name__ == "__main__":
    main()
