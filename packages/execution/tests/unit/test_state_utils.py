"""Tests for state_utils — input_map resolution."""

from __future__ import annotations

import pytest

from app.state_utils import InputMapError, resolve_input_map


def test_simple_field_access():
    state = {"foo": "bar"}
    result = resolve_input_map({"x": "foo"}, state)
    assert result == {"x": "bar"}


def test_nested_index_access():
    state = {
        "messages": [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "hi"},
        ]
    }
    result = resolve_input_map({"last": "messages[-1].content"}, state)
    assert result == {"last": "hi"}


def test_arithmetic_expression():
    state = {"counter": 5}
    result = resolve_input_map({"next": "counter + 1"}, state)
    assert result == {"next": 6}


def test_missing_field_raises():
    state = {"foo": "bar"}
    with pytest.raises(InputMapError, match="available fields"):
        resolve_input_map({"x": "nonexistent"}, state)


def test_invalid_expression_raises():
    state = {"foo": "bar"}
    with pytest.raises(InputMapError):
        resolve_input_map({"x": "foo @@@ bar"}, state)
