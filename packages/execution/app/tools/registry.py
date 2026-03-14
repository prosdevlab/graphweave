"""Tool registry — lookup built-in tools by name."""

from __future__ import annotations

from app.tools.base import BaseTool, ToolNotFoundError
from app.tools.calculator import CalculatorTool
from app.tools.datetime_tool import DatetimeTool
from app.tools.file_read import FileReadTool
from app.tools.file_write import FileWriteTool
from app.tools.url_fetch import UrlFetchTool
from app.tools.weather import WeatherTool
from app.tools.web_search import WebSearchTool
from app.tools.wikipedia_tool import WikipediaTool

__all__ = ["BaseTool", "ToolNotFoundError", "REGISTRY", "get_tool"]

REGISTRY: dict[str, BaseTool] = {
    "calculator": CalculatorTool(),
    "datetime": DatetimeTool(),
    "url_fetch": UrlFetchTool(),
    "web_search": WebSearchTool(),
    "wikipedia": WikipediaTool(),
    "file_read": FileReadTool(),
    "file_write": FileWriteTool(),
    "weather": WeatherTool(),
}


def get_tool(name: str) -> BaseTool:
    """Look up a tool by name.

    Raises:
        ToolNotFoundError: If the tool is not registered.
    """
    if name not in REGISTRY:
        raise ToolNotFoundError(f"Unknown tool: {name}")
    return REGISTRY[name]
