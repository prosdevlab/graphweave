"""Base tool interface — shared by all tools and the registry."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ToolParameter:
    """Describes a single input parameter for a tool."""

    name: str
    type: str  # "string" | "number"
    required: bool
    description: str = ""
    default: str | None = None
    examples: list[str] | None = None


class BaseTool(ABC):
    """Base interface for all GraphWeave tools.

    ``run()`` is intentionally sync.  Only ``url_fetch`` does I/O — the
    executor wraps calls in ``asyncio.to_thread()`` (Phase 3).
    """

    name: str
    description: str
    parameters: list[ToolParameter] = []

    @abstractmethod
    def run(self, inputs: dict) -> dict:
        """Execute the tool.

        Returns:
            Response envelope:
            - Success: { success: True, result, source, truncated }
            - Error:   { success: False, error, recoverable }
        """
        ...


class ToolNotFoundError(Exception):
    """Raised when a tool name is not in the registry."""
