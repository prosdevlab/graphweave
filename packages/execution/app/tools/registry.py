"""Tool registry — lookup built-in tools by name."""

from __future__ import annotations

from app.tools.base import BaseTool, ToolNotFoundError
from app.tools.calculator import CalculatorTool
from app.tools.datetime_tool import DatetimeTool
from app.tools.url_fetch import UrlFetchTool

__all__ = ["BaseTool", "ToolNotFoundError", "REGISTRY", "get_tool"]

REGISTRY: dict[str, BaseTool] = {
    "calculator": CalculatorTool(),
    "datetime": DatetimeTool(),
    "url_fetch": UrlFetchTool(),
}


def get_tool(name: str) -> BaseTool:
    """Look up a tool by name.

    Raises:
        ToolNotFoundError: If the tool is not registered.
    """
    if name not in REGISTRY:
        raise ToolNotFoundError(f"Unknown tool: {name}")
    return REGISTRY[name]
