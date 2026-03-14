"""Tool registry tests."""

from __future__ import annotations

import pytest

from app.tools.registry import REGISTRY, ToolNotFoundError, get_tool

_ALL_TOOLS = {
    "calculator",
    "datetime",
    "url_fetch",
    "web_search",
    "wikipedia",
    "file_read",
    "file_write",
    "weather",
}


def test_unknown_tool_raises():
    with pytest.raises(ToolNotFoundError, match="Unknown tool: nonexistent"):
        get_tool("nonexistent")


@pytest.mark.parametrize("name", sorted(_ALL_TOOLS))
def test_registered_tools_are_retrievable(name):
    tool = get_tool(name)
    assert tool.name == name


def test_registry_has_all_eight_tools():
    assert len(REGISTRY) == 8
    assert set(REGISTRY.keys()) == _ALL_TOOLS
