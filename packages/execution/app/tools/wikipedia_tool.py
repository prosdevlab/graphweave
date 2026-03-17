"""Wikipedia tool — search titles and retrieve page content."""

from __future__ import annotations

import httpx
import wikipediaapi

from app.tools.base import BaseTool, ToolParameter

_MAX_TEXT_LENGTH = 10_000
_SEARCH_LIMIT = 5
_USER_AGENT = "GraphWeave/1.0 (https://github.com/prosdevlab/graphweave)"


class WikipediaTool(BaseTool):
    name = "wikipedia"
    description = "Search Wikipedia titles or retrieve page content"
    parameters = [
        ToolParameter(
            name="query",
            type="string",
            required=False,
            description="Search query — required for action=search",
            examples=["artificial intelligence"],
        ),
        ToolParameter(
            name="action",
            type="string",
            required=False,
            description="search or page",
            default="search",
            examples=["search", "page"],
        ),
        ToolParameter(
            name="title",
            type="string",
            required=False,
            description="Page title — required for action=page",
            examples=["Python (programming language)"],
        ),
    ]

    def run(self, inputs: dict) -> dict:
        action = inputs.get("action", "search")

        if action == "search":
            return self._search(inputs.get("query", ""))
        if action == "page":
            return self._get_page(inputs.get("title", ""))

        return {
            "success": False,
            "error": f"Unknown action: {action}",
            "recoverable": False,
        }

    def _search(self, query: str) -> dict:
        if not query.strip():
            return {
                "success": False,
                "error": "Empty search query",
                "recoverable": False,
            }

        try:
            resp = httpx.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "opensearch",
                    "search": query,
                    "limit": _SEARCH_LIMIT,
                    "format": "json",
                },
                headers={"User-Agent": _USER_AGENT},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            # opensearch returns [query, [titles], [descriptions], [urls]]
            titles = data[1] if len(data) > 1 else []
            return {
                "success": True,
                "result": "\n".join(titles) if titles else "No results found.",
                "source": "wikipedia",
                "truncated": False,
            }
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Wikipedia search timed out",
                "recoverable": True,
            }
        except httpx.HTTPError as exc:
            return {
                "success": False,
                "error": f"Wikipedia search error: {exc}",
                "recoverable": True,
            }

    def _get_page(self, title: str) -> dict:
        if not title.strip():
            return {
                "success": False,
                "error": "No title provided",
                "recoverable": False,
            }

        wiki = wikipediaapi.Wikipedia(user_agent=_USER_AGENT, language="en")
        try:
            page = wiki.page(title)
        except Exception as exc:
            return {
                "success": False,
                "error": f"Wikipedia API error: {exc}",
                "recoverable": True,
            }

        if not page.exists():
            return {
                "success": False,
                "error": f"Page not found: {title}",
                "recoverable": False,
            }

        text = page.summary
        full_text = page.text
        if full_text and len(full_text) > len(text):
            text = full_text

        truncated = len(text) > _MAX_TEXT_LENGTH
        if truncated:
            text = text[:_MAX_TEXT_LENGTH]

        return {
            "success": True,
            "result": text,
            "source": f"wikipedia:{title}",
            "truncated": truncated,
        }
