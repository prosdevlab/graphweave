---
name: gw-testing
description: "MockLLM setup, test structure (unit vs integration), CI test pipeline, frontend store testing with mock EventSource, tool testing without network, and migration testing. Load when writing tests, setting up CI, or deciding where a test belongs."
disable-model-invocation: true
---

# Skill: Testing

Load this when: writing tests, setting up CI, or deciding where a test belongs.

---

## Core rule

No real API calls in CI. Ever.
All execution layer tests use MockLLM.
Real API calls live in tests/integration/ and run manually or on a schedule.

---

## MockLLM — deterministic testing

```python
class MockLLM:
    """Deterministic LLM for testing. Returns scripted responses by node_id."""

    def __init__(self, responses: dict[str, str]):
        self.responses = responses   # { node_id: response_content }

    def invoke(self, messages):
        node_id = messages[-1].get("node_id", "default")
        return AIMessage(content=self.responses.get(node_id, "mock response"))

    async def ainvoke(self, messages):
        return self.invoke(messages)

# Usage:
mock_llm = MockLLM({
    "llm_1": "This is the LLM response for node llm_1",
    "router": "yes",
})
graph = build_graph(schema, llm=mock_llm)
result = await graph.ainvoke({"messages": [HumanMessage(content="test")]})
```

## Test structure

```
packages/execution/
├── tests/
│   ├── unit/
│   │   ├── test_builder.py      # GraphSchema → StateGraph (MockLLM)
│   │   ├── test_executor.py     # SSE event generation (MockLLM)
│   │   ├── test_exporter.py     # code gen + compile validation
│   │   ├── test_migrations.py   # migration runner
│   │   └── test_tools/          # each tool in isolation (no network)
│   └── integration/             # real API calls — NOT in CI
│       ├── test_openai.py
│       └── test_gemini.py

packages/canvas/
├── src/
│   └── store/
│       └── __tests__/
│           ├── runSlice.test.ts      # SSE hook with mock EventSource
│           ├── graphSlice.test.ts    # graph CRUD
│           └── reconnection.test.ts  # reconnection state machine
```

## What runs in CI (every PR)

```bash
pnpm biome check .              # formatting + linting (Biome, no ESLint)
pnpm typecheck                  # tsc --noEmit — also enforces layer boundaries
uv run pytest tests/unit/       # execution unit tests — MockLLM, no API calls
pnpm test                       # canvas store unit tests — mock EventSource
```

## What runs manually / on schedule

```bash
uv run pytest tests/integration/   # real API calls — requires OPENAI_API_KEY etc.
```

## Frontend testing patterns

```typescript
// Store slices are pure functions — test without React
import { createGraphStore } from '../store/graphSlice'

test('adds a node', () => {
  const store = createGraphStore()
  store.getState().addNode({ type: 'llm', ... })
  expect(store.getState().nodes).toHaveLength(1)
})

// SSE hook — mock EventSource
class MockEventSource {
  constructor(public url: string) {}
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  close = jest.fn()

  // Simulate an event
  emit(event: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ event, data }) } as MessageEvent)
  }
}

global.EventSource = MockEventSource as any
```

## Tool testing — no network

```python
# Each tool tested with mocked external calls

from unittest.mock import patch

def test_web_search_tavily():
    with patch("app.tools.web_search.TavilyClient") as mock:
        mock.return_value.search.return_value = { "results": [...] }
        tool = WebSearchTool()
        result = tool.run({ "query": "test" })
        assert result["success"] is True
        assert result["source"] == "tavily"

def test_web_search_fallback_to_ddg():
    # When TAVILY_API_KEY is not set
    with patch.dict(os.environ, {}, clear=True):
        tool = WebSearchTool()
        result = tool.run({ "query": "test" })
        assert result["source"] == "duckduckgo"
```

## Migration testing

```python
def test_migration_rollback_on_failure():
    db = create_test_db()
    # Inject a broken migration
    broken = Migration(version=99, up=lambda db: db.execute("INVALID SQL"))
    with pytest.raises(MigrationError):
        run_migrations(db, migrations=[broken])
    # Database should be unchanged
    assert get_schema_version(db) < 99
```
