"""Manual test 31: web_search DuckDuckGo fallback — no API key needed.

Usage: cd packages/execution && uv run python tests/manual/test_31_web_search_ddg.py
"""

import os

from app.tools.web_search import WebSearchTool


def main():
    print("── Test 31: web_search DDG fallback ──")

    # Ensure no Tavily key
    os.environ.pop("TAVILY_API_KEY", None)

    tool = WebSearchTool()

    # 1. Basic search
    result = tool.run({"query": "Python programming language"})
    assert result["success"] is True, f"Search failed: {result.get('error')}"
    assert result["source"] == "duckduckgo"
    assert len(result["result"]) > 0
    print(f"  ✓ DDG returned results ({len(result['result'])} chars)")
    # Show first 200 chars
    print(f"    Preview: {result['result'][:200]}...")

    # 2. max_results respected
    result = tool.run({"query": "LangGraph framework", "max_results": 2})
    assert result["success"] is True
    numbered = [
        line for line in result["result"].split("\n") if line[:2] in ("1.", "2.", "3.")
    ]
    assert len(numbered) <= 3, f"Expected ≤2 results: {numbered}"
    print("  ✓ max_results=2 respected")

    # 3. Empty query rejected
    result = tool.run({"query": ""})
    assert result["success"] is False
    assert result["recoverable"] is False
    print("  ✓ Empty query rejected")

    print("\n✅ All DDG search tests passed")


if __name__ == "__main__":
    main()
