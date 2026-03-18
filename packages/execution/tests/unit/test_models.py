"""Tests for model listing functions."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import (
    ANTHROPIC_MODELS,
    list_anthropic_models,
    list_gemini_models,
    list_openai_models,
)


@pytest.mark.asyncio
async def test_openai_no_key():
    with patch.dict("os.environ", {}, clear=True):
        result = await list_openai_models()
    assert result == []


@pytest.mark.asyncio
async def test_openai_success():
    mock_model = lambda id: MagicMock(id=id)  # noqa: E731
    mock_response = MagicMock()
    mock_response.data = [
        mock_model("gpt-4o"),
        mock_model("gpt-4o-mini"),
        mock_model("o1-preview"),
        mock_model("o3-mini"),
        mock_model("chatgpt-4o-latest"),
        mock_model("dall-e-3"),
        mock_model("whisper-1"),
        mock_model("tts-1"),
        mock_model("text-embedding-ada-002"),
        mock_model("gpt-4o-realtime-preview"),
    ]

    mock_client = MagicMock()
    mock_client.models.list = AsyncMock(return_value=mock_response)

    mock_openai_module = MagicMock()
    mock_openai_module.AsyncOpenAI = MagicMock(return_value=mock_client)

    with (
        patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}),
        patch.dict("sys.modules", {"openai": mock_openai_module}),
    ):
        result = await list_openai_models()

    # Should include gpt-*, o1-*, o3-*, chatgpt-*
    # Should exclude dall-e, whisper, tts, embedding, realtime
    assert "gpt-4o" in result
    assert "gpt-4o-mini" in result
    assert "o1-preview" in result
    assert "o3-mini" in result
    assert "chatgpt-4o-latest" in result
    assert "dall-e-3" not in result
    assert "whisper-1" not in result
    assert "tts-1" not in result
    assert "text-embedding-ada-002" not in result
    assert "gpt-4o-realtime-preview" not in result


@pytest.mark.asyncio
async def test_openai_error():
    mock_openai_module = MagicMock()
    mock_openai_module.AsyncOpenAI = MagicMock(side_effect=Exception("API error"))

    with (
        patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"}),
        patch.dict("sys.modules", {"openai": mock_openai_module}),
    ):
        result = await list_openai_models()
    assert result == []


@pytest.mark.asyncio
async def test_gemini_no_key():
    with patch.dict("os.environ", {}, clear=True):
        result = await list_gemini_models()
    assert result == []


def test_anthropic_configured():
    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
        result = list_anthropic_models()
    assert result == list(ANTHROPIC_MODELS)


def test_anthropic_no_key():
    with patch.dict("os.environ", {}, clear=True):
        result = list_anthropic_models()
    assert result == []
