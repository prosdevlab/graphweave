"""Datetime tool tests."""

from __future__ import annotations

from datetime import datetime

from app.tools.datetime_tool import DatetimeTool


def _dt(inputs: dict) -> dict:
    return DatetimeTool().run(inputs)


def test_now_returns_valid_iso():
    result = _dt({"action": "now"})
    assert result["success"] is True
    # Should parse without error
    datetime.fromisoformat(result["result"])


def test_format_date():
    result = _dt(
        {
            "action": "format",
            "date": "2026-03-13T10:00:00",
            "fmt": "%Y/%m/%d",
        }
    )
    assert result["success"] is True
    assert result["result"] == "2026/03/13"


def test_parse_iso_date():
    result = _dt({"action": "parse", "date": "2026-03-13"})
    assert result["success"] is True
    assert "2026-03-13" in result["result"]


def test_non_iso_date_fails():
    result = _dt({"action": "parse", "date": "March 13, 2026"})
    assert result["success"] is False
    assert result["recoverable"] is True


def test_unknown_action():
    result = _dt({"action": "invalid"})
    assert result["success"] is False
    assert result["recoverable"] is False
