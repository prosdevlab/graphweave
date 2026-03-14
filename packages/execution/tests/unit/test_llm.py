"""Tests for the LLM provider factory."""

import pytest
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.llm import get_llm


@pytest.fixture(autouse=True)
def _dummy_api_keys(monkeypatch):
    """Set dummy API keys so providers don't reject instantiation."""
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake")
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-google-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fake-anthropic-key")


def test_get_llm_openai():
    llm = get_llm("openai", "gpt-4o", temperature=0.5, max_tokens=200)
    assert isinstance(llm, ChatOpenAI)


def test_get_llm_gemini():
    llm = get_llm("gemini", "gemini-2.0-flash")
    assert isinstance(llm, ChatGoogleGenerativeAI)


def test_get_llm_anthropic():
    llm = get_llm("anthropic", "claude-sonnet-4-20250514")
    assert isinstance(llm, ChatAnthropic)


def test_get_llm_unknown_raises():
    with pytest.raises(ValueError, match="Unsupported LLM provider: cohere"):
        get_llm("cohere", "some-model")
