"""Tool registry unit tests."""

import pytest

from app.tools.registry import ToolNotFoundError, get_tool


def test_unknown_tool_raises() -> None:
    with pytest.raises(ToolNotFoundError, match="Unknown tool: nonexistent"):
        get_tool("nonexistent")
