# Part 4.4 -- Model Fetching

## Goal

Make the `GET /v1/settings/providers` endpoint return real model lists instead of
empty arrays. Update LLMNodeConfig to use fetched models with a fallback to
hardcoded lists.

## Commit message

```
feat: fetch real model lists from LLM providers

Update GET /settings/providers to query each configured provider for
available models. OpenAI uses client.models.list(), Gemini uses
genai.list_models(), Anthropic uses a hardcoded curated list (no list
API). LLMNodeConfig now reads from settingsSlice with hardcoded fallback.
```

## Files to modify

| File | Change |
|------|--------|
| `packages/execution/app/main.py` | Update `get_providers` to call model listing functions |
| `packages/execution/app/models.py` | **New** -- model listing functions per provider |
| `packages/execution/tests/unit/test_models.py` | **New** -- tests for model listing |
| `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx` | Use fetched models from settingsSlice, fallback to hardcoded |
| `packages/canvas/src/store/settingsSlice.ts` | Expose model list getter |

## Design

### Execution layer: model listing

Create `packages/execution/app/models.py` with functions to list models per provider.

```python
import logging
import os

logger = logging.getLogger(__name__)

# Anthropic has no model listing API -- curated list
ANTHROPIC_MODELS = [
    "claude-sonnet-4-20250514",
    "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022",
]


async def list_openai_models() -> list[str]:
    """List available OpenAI chat models."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return []
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI()
        response = await client.models.list()
        # Exclude known non-chat models; keep gpt-*, o1-*, o3-*, chatgpt-*
        NON_CHAT_PREFIXES = ("dall-e", "whisper", "tts", "text-embedding", "babbage", "davinci")
        chat_models = sorted(
            m.id for m in response.data
            if not m.id.startswith(NON_CHAT_PREFIXES) and "realtime" not in m.id
        )
        return chat_models
    except Exception:
        logger.exception("Failed to list OpenAI models")
        return []


async def list_gemini_models() -> list[str]:
    """List available Gemini models that support generateContent."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return []
    try:
        import asyncio
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        # genai.list_models() is synchronous — wrap to avoid blocking event loop
        raw_models = await asyncio.to_thread(genai.list_models)
        models = []
        for m in raw_models:
            if "generateContent" in (m.supported_generation_methods or []):
                # Strip "models/" prefix
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
    return ANTHROPIC_MODELS
```

### Updated get_providers endpoint

```python
@app.get("/v1/settings/providers", ...)
async def get_providers() -> dict:
    from app.models import list_openai_models, list_gemini_models, list_anthropic_models

    openai_models = await list_openai_models()
    gemini_models = await list_gemini_models()
    anthropic_models = list_anthropic_models()

    return {
        "openai": {
            "configured": bool(os.getenv("OPENAI_API_KEY")),
            "models": openai_models,
        },
        "gemini": {
            "configured": bool(os.getenv("GEMINI_API_KEY")),
            "models": gemini_models,
        },
        "anthropic": {
            "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
            "models": anthropic_models,
        },
    }
```

### Performance concern

Model listing hits external APIs. The endpoint is called once (fetch-once pattern
in settingsSlice). However, we should avoid blocking the response if a provider
API is slow.

**Approach**: Use `asyncio.gather` with timeouts for parallel fetching:

```python
import asyncio

async def get_providers() -> dict:
    from app.models import list_openai_models, list_gemini_models, list_anthropic_models

    # Fetch all providers in parallel with 5s timeout per provider
    async def _with_timeout(coro):
        try:
            return await asyncio.wait_for(coro, timeout=5.0)
        except (asyncio.TimeoutError, Exception):
            return []

    openai_models, gemini_models = await asyncio.gather(
        _with_timeout(list_openai_models()),
        _with_timeout(list_gemini_models()),
    )
    anthropic_models = list_anthropic_models()  # sync, no timeout needed
    # ... return dict
```

### Canvas: LLMNodeConfig model dropdown

```typescript
// BEFORE
const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
};
const models = MODEL_OPTIONS[node.config.provider] ?? [];

// AFTER
const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  gemini: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
};

// Inside component:
const providers = useSettingsStore((s) => s.providers);
const loadProviders = useSettingsStore((s) => s.loadProviders);

useEffect(() => { loadProviders(); }, [loadProviders]);

const models = useMemo(() => {
  const fetched = providers?.[node.config.provider]?.models;
  if (fetched && fetched.length > 0) return fetched;
  return FALLBACK_MODELS[node.config.provider] ?? [];
}, [providers, node.config.provider]);
```

The `// TODO(C3): Fetch available models from /settings/providers` comment gets removed.

**Fetch-once guard**: `loadProviders` in settingsSlice already has
`if (get().providersLoaded) return;` at the top. This prevents re-fetching on
every LLMNodeConfig mount. The `useEffect` fires on mount but the guard ensures
only the first mount triggers network calls. This is critical — without it,
every LLM node click would hit OpenAI/Gemini listing APIs.

### Model dropdown: current value not in list

If the current `node.config.model` is not in the fetched list (e.g. a custom model
name), show it as the first option so it's not lost:

```typescript
const modelOptions = models.includes(node.config.model)
  ? models
  : [node.config.model, ...models];
```

## Required tests

| Test | File | What it verifies |
|------|------|-----------------|
| list_openai_models success | test_models.py | Returns filtered chat model names |
| list_openai_models no key | test_models.py | Returns empty list |
| list_openai_models error | test_models.py | Catches exception, returns empty |
| list_gemini_models success | test_models.py | Returns model names without "models/" prefix |
| list_anthropic_models configured | test_models.py | Returns curated list |
| list_anthropic_models no key | test_models.py | Returns empty list |
| LLMNodeConfig uses fetched models | LLMNodeConfig.test.tsx | Shows provider models from settingsSlice |
| LLMNodeConfig fallback | LLMNodeConfig.test.tsx | Shows hardcoded models when fetch returns empty |
| Provider change selects from fetched | LLMNodeConfig.test.tsx | Changing provider picks first model from fetched list, not fallback |
| Current model not in list | LLMNodeConfig.test.tsx | Custom model prepended to dropdown options |
| OpenAI o1/o3 models included | test_models.py | Filter includes o1-preview, o3-mini, chatgpt-4o-latest |

## Verification steps

1. `uv run pytest tests/unit/test_models.py -v` -- new tests pass
2. `pnpm tsc --noEmit` in canvas -- no type errors
3. `pnpm test` in canvas -- all tests pass
4. Manual: with OPENAI_API_KEY set, open LLM node config, verify real models in dropdown
5. Manual: with no keys set, verify fallback models shown

## Detailed todolist

### Execution layer

- [ ] Create `packages/execution/app/models.py`
  - [ ] `ANTHROPIC_MODELS` constant -- curated list of supported models
  - [ ] `async def list_openai_models() -> list[str]` -- use AsyncOpenAI, filter to gpt-* chat models
  - [ ] `async def list_gemini_models() -> list[str]` -- use `asyncio.to_thread(genai.list_models)` to avoid blocking the event loop, filter to generateContent
  - [ ] `def list_anthropic_models() -> list[str]` -- return curated list if key present

- [ ] Open `packages/execution/app/main.py`
  - [ ] Update `get_providers()` to import and call model listing functions
  - [ ] Use `asyncio.gather` with `_with_timeout` wrapper for parallel fetching
  - [ ] Keep the `configured` boolean logic as-is
  - [ ] Replace `"models": []` with actual model lists

### Tests (execution)

- [ ] Create `packages/execution/tests/unit/test_models.py`
  - [ ] Test `list_openai_models` with mocked AsyncOpenAI client
  - [ ] Test `list_openai_models` returns `[]` when no API key (mock os.getenv)
  - [ ] Test `list_gemini_models` with mocked genai.list_models
  - [ ] Test `list_anthropic_models` returns curated list when key present
  - [ ] Test `list_anthropic_models` returns `[]` when key absent

### Canvas layer

- [ ] Open `packages/canvas/src/components/panels/config/LLMNodeConfig.tsx`
  - [ ] Rename `MODEL_OPTIONS` to `FALLBACK_MODELS`
  - [ ] Import `useSettingsStore` from `@store/settingsSlice`
  - [ ] Add `const providers = useSettingsStore((s) => s.providers)`
  - [ ] Add `const loadProviders = useSettingsStore((s) => s.loadProviders)`
  - [ ] Add `useEffect(() => { loadProviders(); }, [loadProviders])`
  - [ ] Replace `const models = MODEL_OPTIONS[...]` with useMemo that prefers fetched over fallback
  - [ ] Handle current model not in list (prepend if missing)
  - [ ] Update `handleProviderChange` to use the reactive `models` memo (not static FALLBACK_MODELS) when selecting the default model
  - [ ] Remove the `// TODO(C3)` comment

### Verify

- [ ] `cd packages/execution && uv run pytest tests/unit/ -v`
- [ ] `cd packages/canvas && pnpm tsc --noEmit`
- [ ] `cd packages/canvas && pnpm test`
