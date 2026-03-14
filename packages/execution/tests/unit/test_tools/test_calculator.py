"""Calculator tool tests."""

from __future__ import annotations

from app.tools.calculator import CalculatorTool


def _calc(expr: str) -> dict:
    return CalculatorTool().run({"expression": expr})


def test_basic_math():
    result = _calc("2 + 2")
    assert result["success"] is True
    assert result["result"] == "4"


def test_division_by_zero():
    result = _calc("1 / 0")
    assert result["success"] is False
    assert result["recoverable"] is True


def test_invalid_expression():
    result = _calc("not valid +++")
    assert result["success"] is False
    assert result["recoverable"] is True


def test_exponentiation_within_limits():
    result = _calc("2 ** 10")
    assert result["success"] is True
    assert result["result"] == "1024"


def test_exponentiation_exceeding_max_power():
    result = _calc("2 ** 10000")
    assert result["success"] is False
    assert result["recoverable"] is True
