"""Tool registry tests."""

from __future__ import annotations

import pytest

from app.tools.registry import REGISTRY, ToolNotFoundError, get_tool


def test_unknown_tool_raises():
    with pytest.raises(ToolNotFoundError, match="Unknown tool: nonexistent"):
        get_tool("nonexistent")


@pytest.mark.parametrize("name", ["calculator", "datetime", "url_fetch"])
def test_registered_tools_are_retrievable(name):
    tool = get_tool(name)
    assert tool.name == name


def test_registry_has_expected_tools():
    assert set(REGISTRY.keys()) == {"calculator", "datetime", "url_fetch"}
