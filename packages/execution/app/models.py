"""Model listing functions per LLM provider."""

from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger(__name__)

# Anthropic has no model listing API — curated list
ANTHROPIC_MODELS = [
    "claude-sonnet-4-20250514",
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
]

# Prefixes for non-chat models returned by OpenAI's models.list()
_OPENAI_NON_CHAT_PREFIXES = (
    "dall-e",
    "whisper",
    "tts",
    "text-embedding",
    "babbage",
    "davinci",
    "moderation",
)


async def list_openai_models() -> list[str]:
    """List available OpenAI chat models."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return []
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI()
        response = await client.models.list()
        return sorted(
            m.id
            for m in response.data
            if not m.id.startswith(_OPENAI_NON_CHAT_PREFIXES) and "realtime" not in m.id
        )
    except Exception:
        logger.exception("Failed to list OpenAI models")
        return []


async def list_gemini_models() -> list[str]:
    """List available Gemini models that support generateContent."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return []
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        # genai.list_models() is synchronous — wrap to avoid blocking event loop
        raw_models = await asyncio.to_thread(genai.list_models)
        models = []
        for m in raw_models:
            if "generateContent" in (m.supported_generation_methods or []):
                name = m.name.replace("models/", "") if m.name else ""
                if name:
                    models.append(name)
        return sorted(models)
    except Exception:
        logger.exception("Failed to list Gemini models")
        return []


def list_anthropic_models() -> list[str]:
    """Return curated Anthropic model list (no listing API)."""
    if not os.getenv("ANTHROPIC_API_KEY"):
        return []
    return list(ANTHROPIC_MODELS)
