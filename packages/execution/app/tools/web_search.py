"""Web search tool — Tavily with DuckDuckGo fallback."""

from __future__ import annotations

import os

from app.tools.base import BaseTool

_MAX_RESULTS = 10


class WebSearchTool(BaseTool):
    name = "web_search"
    description = "Search the web and return results with titles, URLs, and snippets"

    def run(self, inputs: dict) -> dict:
        query = inputs.get("query", "").strip()
        if not query:
            return {
                "success": False,
                "error": "Empty search query",
                "recoverable": False,
            }

        max_results = min(int(inputs.get("max_results", 5)), _MAX_RESULTS)

        tavily_key = os.environ.get("TAVILY_API_KEY")
        if tavily_key:
            return self._search_tavily(query, max_results, tavily_key)
        return self._search_ddg(query, max_results)

    def _search_tavily(self, query: str, max_results: int, api_key: str) -> dict:
        try:
            from tavily import TavilyClient

            client = TavilyClient(api_key=api_key)
            response = client.search(query, max_results=max_results)
            results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                }
                for r in response.get("results", [])
            ]
            return {
                "success": True,
                "result": _format_results(results),
                "source": "tavily",
                "truncated": False,
            }
        except Exception as exc:
            return {
                "success": False,
                "error": f"Tavily search error: {exc}",
                "recoverable": True,
            }

    def _search_ddg(self, query: str, max_results: int) -> dict:
        try:
            # duckduckgo-search >=6.0,<8.0 — DDGS().text(keywords, max_results=N)
            from duckduckgo_search import DDGS

            with DDGS() as ddgs:
                raw = ddgs.text(query, max_results=max_results)
            results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                }
                for r in raw
            ]
            return {
                "success": True,
                "result": _format_results(results),
                "source": "duckduckgo",
                "truncated": False,
            }
        except Exception as exc:
            return {
                "success": False,
                "error": f"DuckDuckGo search error: {exc}",
                "recoverable": True,
            }


def _format_results(results: list[dict]) -> str:
    """Format search results as readable text."""
    if not results:
        return "No results found."
    lines = []
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        lines.append(f"   {r['url']}")
        if r["snippet"]:
            lines.append(f"   {r['snippet']}")
        lines.append("")
    return "\n".join(lines).strip()
