"""Base tool interface — shared by all tools and the registry."""

from __future__ import annotations

from abc import ABC, abstractmethod


class BaseTool(ABC):
    """Base interface for all GraphWeave tools.

    ``run()`` is intentionally sync.  Only ``url_fetch`` does I/O — the
    executor wraps calls in ``asyncio.to_thread()`` (Phase 3).
    """

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
