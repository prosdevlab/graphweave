"""Wikipedia tool tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from app.tools.wikipedia_tool import WikipediaTool


def _wiki(inputs: dict) -> dict:
    return WikipediaTool().run(inputs)


def test_search_returns_titles():
    mock_response = MagicMock()
    mock_response.json.return_value = [
        "python",
        ["Python (programming language)", "Python (genus)"],
        ["", ""],
        ["https://en.wikipedia.org/wiki/Python_(programming_language)", ""],
    ]
    mock_response.raise_for_status = MagicMock()

    with patch("app.tools.wikipedia_tool.httpx.get", return_value=mock_response):
        result = _wiki({"action": "search", "query": "python"})

    assert result["success"] is True
    assert "Python (programming language)" in result["result"]
    assert result["source"] == "wikipedia"


def test_search_empty_query():
    result = _wiki({"action": "search", "query": ""})
    assert result["success"] is False
    assert result["recoverable"] is False


def test_search_timeout():
    with patch(
        "app.tools.wikipedia_tool.httpx.get",
        side_effect=httpx.TimeoutException("timed out"),
    ):
        result = _wiki({"action": "search", "query": "test"})

    assert result["success"] is False
    assert result["recoverable"] is True


def test_page_content():
    mock_page = MagicMock()
    mock_page.exists.return_value = True
    mock_page.summary = "Python is a programming language."
    mock_page.text = "Python is a programming language. More details..."

    mock_wiki = MagicMock()
    mock_wiki.page.return_value = mock_page

    with patch(
        "app.tools.wikipedia_tool.wikipediaapi.Wikipedia", return_value=mock_wiki
    ):
        result = _wiki({"action": "page", "title": "Python"})

    assert result["success"] is True
    assert "programming language" in result["result"]


def test_page_not_found():
    mock_page = MagicMock()
    mock_page.exists.return_value = False

    mock_wiki = MagicMock()
    mock_wiki.page.return_value = mock_page

    with patch(
        "app.tools.wikipedia_tool.wikipediaapi.Wikipedia", return_value=mock_wiki
    ):
        result = _wiki({"action": "page", "title": "Nonexistent12345"})

    assert result["success"] is False
    assert result["recoverable"] is False


def test_page_truncation():
    mock_page = MagicMock()
    mock_page.exists.return_value = True
    mock_page.summary = "Short summary."
    mock_page.text = "x" * 15_000

    mock_wiki = MagicMock()
    mock_wiki.page.return_value = mock_page

    with patch(
        "app.tools.wikipedia_tool.wikipediaapi.Wikipedia", return_value=mock_wiki
    ):
        result = _wiki({"action": "page", "title": "Long Article"})

    assert result["success"] is True
    assert result["truncated"] is True
    assert len(result["result"]) == 10_000


def test_user_agent_set():
    with patch("app.tools.wikipedia_tool.wikipediaapi.Wikipedia") as mock_wiki_cls:
        mock_page = MagicMock()
        mock_page.exists.return_value = True
        mock_page.summary = "test"
        mock_page.text = "test"
        mock_wiki_cls.return_value.page.return_value = mock_page

        _wiki({"action": "page", "title": "Test"})

    call_kwargs = mock_wiki_cls.call_args[1]
    assert "GraphWeave" in call_kwargs["user_agent"]
    assert call_kwargs["language"] == "en"


def test_unknown_action():
    result = _wiki({"action": "unknown"})
    assert result["success"] is False
