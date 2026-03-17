"""Tests for tool parameter declarations and endpoint serialization."""

from __future__ import annotations

import httpx
import pytest

from app.main import app
from app.tools.registry import REGISTRY


@pytest.fixture
async def client():
    """Unauthenticated AsyncClient — settings/tools is public."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_get_tools_includes_parameters(client):
    """Each tool returned by /v1/settings/tools must have a parameters array."""
    response = await client.get("/v1/settings/tools")
    assert response.status_code == 200
    tools = response.json()
    assert len(tools) > 0

    for tool in tools:
        assert "name" in tool
        assert "description" in tool
        assert "parameters" in tool, f"Tool {tool['name']!r} missing 'parameters'"
        assert isinstance(tool["parameters"], list)

        for param in tool["parameters"]:
            assert "name" in param, f"Param in {tool['name']!r} missing 'name'"
            assert "type" in param, f"Param in {tool['name']!r} missing 'type'"
            assert "required" in param, f"Param in {tool['name']!r} missing 'required'"
            assert "description" in param, (
                f"Param in {tool['name']!r} missing 'description'"
            )
            assert isinstance(param["required"], bool)
            pname = param["name"]
            tname = tool["name"]
            assert "examples" in param, (
                f"Param {pname!r} in {tname!r} missing 'examples'"
            )
            assert param["examples"] is None or isinstance(param["examples"], list), (
                f"Param {pname!r} in {tname!r}: examples must be list or null"
            )


@pytest.mark.anyio
async def test_tool_parameters_match_run_inputs(client):
    """Every inputs.get('X') call must have a matching ToolParameter(name='X')."""
    import ast
    import inspect
    import textwrap

    for tool_name, tool in REGISTRY.items():
        source = textwrap.dedent(inspect.getsource(tool.run))
        tree = ast.parse(source)

        # Collect all inputs.get("key") and inputs["key"] calls
        input_keys: set[str] = set()
        for node in ast.walk(tree):
            # inputs.get("key") or inputs.get("key", default)
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "get"
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id == "inputs"
                and node.args
                and isinstance(node.args[0], ast.Constant)
            ):
                input_keys.add(node.args[0].value)
            # inputs["key"]
            elif (
                isinstance(node, ast.Subscript)
                and isinstance(node.value, ast.Name)
                and node.value.id == "inputs"
                and isinstance(node.slice, ast.Constant)
            ):
                input_keys.add(node.slice.value)

        declared_names = {p.name for p in tool.parameters}
        for key in input_keys:
            assert key in declared_names, (
                f"Tool {tool_name!r}: inputs key {key!r} has no matching ToolParameter"
            )
