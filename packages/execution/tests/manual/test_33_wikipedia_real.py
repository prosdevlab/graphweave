"""Manual test 33: Wikipedia search + page — real API calls.

Usage: cd packages/execution && uv run python tests/manual/test_33_wikipedia_real.py
"""

from app.tools.wikipedia_tool import WikipediaTool


def main():
    print("── Test 33: Wikipedia real API ──")

    tool = WikipediaTool()

    # 1. Search
    result = tool.run({"action": "search", "query": "Python programming"})
    assert result["success"] is True, f"Search failed: {result.get('error')}"
    assert "Python" in result["result"]
    print(f"  ✓ Search returned titles:\n    {result['result']}")

    # 2. Page content
    result = tool.run({"action": "page", "title": "Python (programming language)"})
    assert result["success"] is True, f"Page failed: {result.get('error')}"
    assert len(result["result"]) > 100
    assert "programming" in result["result"].lower()
    print(f"  ✓ Page content: {len(result['result'])} chars")
    print(f"    First 200: {result['result'][:200]}...")

    # 3. Page not found
    result = tool.run({"action": "page", "title": "Xyzzy12345Nonexistent"})
    assert result["success"] is False
    assert result["recoverable"] is False
    print(f"  ✓ Not found handled: {result['error']}")

    # 4. Empty search
    result = tool.run({"action": "search", "query": ""})
    assert result["success"] is False
    print("  ✓ Empty search rejected")

    print("\n✅ All Wikipedia tests passed")


if __name__ == "__main__":
    main()
