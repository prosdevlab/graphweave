"""Web search tool tests."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

from app.tools.web_search import WebSearchTool


def _search(inputs: dict) -> dict:
    return WebSearchTool().run(inputs)


def test_empty_query():
    result = _search({"query": ""})
    assert result["success"] is False
    assert result["recoverable"] is False


def test_tavily_path():
    mock_response = {
        "results": [
            {"title": "Result 1", "url": "https://example.com", "content": "Snippet 1"}
        ]
    }
    with (
        patch.dict("os.environ", {"TAVILY_API_KEY": "test-key"}),
        patch("tavily.TavilyClient") as mock_cls,
    ):
        mock_cls.return_value.search.return_value = mock_response
        result = _search({"query": "test query"})

    assert result["success"] is True
    assert result["source"] == "tavily"
    assert "Result 1" in result["result"]
    assert "https://example.com" in result["result"]


def test_ddg_fallback():
    raw = [{"title": "DDG Result", "href": "https://ddg.com", "body": "DDG snippet"}]
    # Ensure no Tavily key
    env = {k: v for k, v in os.environ.items() if k != "TAVILY_API_KEY"}
    with (
        patch.dict("os.environ", env, clear=True),
        patch("duckduckgo_search.DDGS") as mock_ddgs,
    ):
        mock_ctx = MagicMock()
        mock_ctx.text.return_value = raw
        mock_ddgs.return_value.__enter__ = MagicMock(return_value=mock_ctx)
        mock_ddgs.return_value.__exit__ = MagicMock(return_value=False)

        result = _search({"query": "test query"})

    assert result["success"] is True
    assert result["source"] == "duckduckgo"
    assert "DDG Result" in result["result"]


def test_tavily_timeout():
    with (
        patch.dict("os.environ", {"TAVILY_API_KEY": "test-key"}),
        patch("tavily.TavilyClient") as mock_cls,
    ):
        mock_cls.return_value.search.side_effect = Exception("Connection timed out")
        result = _search({"query": "test"})

    assert result["success"] is False
    assert result["recoverable"] is True


def test_max_results_clamped():
    env = {k: v for k, v in os.environ.items() if k != "TAVILY_API_KEY"}
    with (
        patch.dict("os.environ", env, clear=True),
        patch("duckduckgo_search.DDGS") as mock_ddgs,
    ):
        mock_ctx = MagicMock()
        mock_ctx.text.return_value = []
        mock_ddgs.return_value.__enter__ = MagicMock(return_value=mock_ctx)
        mock_ddgs.return_value.__exit__ = MagicMock(return_value=False)

        _search({"query": "test", "max_results": 100})

    mock_ctx.text.assert_called_once_with("test", max_results=10)


def test_max_results_within_range():
    env = {k: v for k, v in os.environ.items() if k != "TAVILY_API_KEY"}
    with (
        patch.dict("os.environ", env, clear=True),
        patch("duckduckgo_search.DDGS") as mock_ddgs,
    ):
        mock_ctx = MagicMock()
        mock_ctx.text.return_value = []
        mock_ddgs.return_value.__enter__ = MagicMock(return_value=mock_ctx)
        mock_ddgs.return_value.__exit__ = MagicMock(return_value=False)

        _search({"query": "test", "max_results": 3})

    mock_ctx.text.assert_called_once_with("test", max_results=3)
