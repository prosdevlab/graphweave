"""LLM provider factory — instantiate chat models by provider name."""

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI


def get_llm(
    provider: str,
    model: str,
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> BaseChatModel:
    """Return a chat model instance for the given provider.

    Raises:
        ValueError: If the provider is not supported.
    """
    match provider:
        case "openai":
            return ChatOpenAI(
                model=model, temperature=temperature, max_tokens=max_tokens
            )
        case "gemini":
            return ChatGoogleGenerativeAI(
                model=model,
                temperature=temperature,
                max_output_tokens=max_tokens,
            )
        case "anthropic":
            return ChatAnthropic(
                model=model, temperature=temperature, max_tokens=max_tokens
            )
        case _:
            raise ValueError(f"Unsupported LLM provider: {provider}")
