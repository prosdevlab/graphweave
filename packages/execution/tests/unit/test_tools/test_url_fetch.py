"""URL fetch tool tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx

from app.tools.url_fetch import UrlFetchTool, validate_url


def _fetch(inputs: dict) -> dict:
    return UrlFetchTool().run(inputs)


# ── validate_url ────────────────────────────────────────────────────────


def test_bad_url_no_scheme():
    error = validate_url("not-a-url")
    assert error is not None
    assert "http" in error.lower() or "scheme" in error.lower()


def test_ssrf_localhost():
    with patch("app.tools.url_fetch.socket.getaddrinfo") as mock_gai:
        mock_gai.return_value = [(None, None, None, None, ("127.0.0.1", 0))]
        error = validate_url("http://localhost/secret")
    assert error is not None
    assert "private" in error.lower() or "blocked" in error.lower()


def test_ssrf_private_ip():
    with patch("app.tools.url_fetch.socket.getaddrinfo") as mock_gai:
        mock_gai.return_value = [(None, None, None, None, ("10.0.0.1", 0))]
        error = validate_url("http://example.com/")
    assert error is not None
    assert "blocked" in error.lower()


# ── UrlFetchTool.run ────────────────────────────────────────────────────


def test_successful_fetch():
    mock_response = MagicMock()
    mock_response.text = "<html><body><p>Hello world</p></body></html>"
    mock_response.raise_for_status = MagicMock()

    with (
        patch("app.tools.url_fetch.validate_url", return_value=None),
        patch("app.tools.url_fetch.httpx.Client") as mock_client_cls,
        patch("app.tools.url_fetch.trafilatura.extract", return_value="Hello world"),
    ):
        mock_client_cls.return_value.__enter__ = MagicMock(
            return_value=MagicMock(get=MagicMock(return_value=mock_response))
        )
        mock_client_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = _fetch({"url": "https://example.com"})

    assert result["success"] is True
    assert result["result"] == "Hello world"
    assert result["truncated"] is False


def test_empty_extraction():
    mock_response = MagicMock()
    mock_response.text = "<html></html>"
    mock_response.raise_for_status = MagicMock()

    with (
        patch("app.tools.url_fetch.validate_url", return_value=None),
        patch("app.tools.url_fetch.httpx.Client") as mock_client_cls,
        patch("app.tools.url_fetch.trafilatura.extract", return_value=None),
    ):
        mock_client_cls.return_value.__enter__ = MagicMock(
            return_value=MagicMock(get=MagicMock(return_value=mock_response))
        )
        mock_client_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = _fetch({"url": "https://example.com"})

    assert result["success"] is True
    assert result["result"] == ""
    assert result["warning"] == "No extractable text content"


def test_truncation():
    long_text = "x" * 15_000

    mock_response = MagicMock()
    mock_response.text = "<html><body>text</body></html>"
    mock_response.raise_for_status = MagicMock()

    with (
        patch("app.tools.url_fetch.validate_url", return_value=None),
        patch("app.tools.url_fetch.httpx.Client") as mock_client_cls,
        patch("app.tools.url_fetch.trafilatura.extract", return_value=long_text),
    ):
        mock_client_cls.return_value.__enter__ = MagicMock(
            return_value=MagicMock(get=MagicMock(return_value=mock_response))
        )
        mock_client_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = _fetch({"url": "https://example.com"})

    assert result["success"] is True
    assert result["truncated"] is True
    assert len(result["result"]) == 10_000


def test_timeout():
    with (
        patch("app.tools.url_fetch.validate_url", return_value=None),
        patch("app.tools.url_fetch.httpx.Client") as mock_client_cls,
    ):
        mock_client = MagicMock()
        mock_client.get.side_effect = httpx.TimeoutException("timed out")
        mock_client_cls.return_value.__enter__ = MagicMock(return_value=mock_client)
        mock_client_cls.return_value.__exit__ = MagicMock(return_value=False)

        result = _fetch({"url": "https://example.com"})

    assert result["success"] is False
    assert result["recoverable"] is True


def test_bad_url_rejected():
    result = _fetch({"url": "ftp://example.com"})
    assert result["success"] is False
    assert result["recoverable"] is False
