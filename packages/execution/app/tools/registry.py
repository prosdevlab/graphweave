"""Tool registry — lookup built-in tools by name."""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseTool(ABC):
    """Base interface for all GraphWeave tools."""

    name: str
    description: str

    @abstractmethod
    def run(self, inputs: dict) -> dict:
        """Execute the tool.

        Returns:
            Response envelope: { success, result/error, recoverable }.
        """
        ...


class ToolNotFoundError(Exception):
    """Raised when a tool name is not in the registry."""


# Registry will be populated as tools are implemented
REGISTRY: dict[str, BaseTool] = {}


def get_tool(name: str) -> BaseTool:
    """Look up a tool by name.

    Raises:
        ToolNotFoundError: If the tool is not registered.
    """
    if name not in REGISTRY:
        raise ToolNotFoundError(f"Unknown tool: {name}")
    return REGISTRY[name]
