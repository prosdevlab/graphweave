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
│   ├── conftest.py              # shared fixtures: db, create_test_key
│   ├── unit/
│   │   ├── test_auth_keys.py    # key generation, hashing, prefix
│   │   ├── test_auth_deps.py    # require_auth, require_scope (401/403)
│   │   ├── test_crud.py         # graph/run CRUD + owner isolation
│   │   ├── test_crud_auth.py    # api_keys CRUD + count admin keys
│   │   ├── test_migrations.py   # migration runner, schema v2
│   │   ├── test_routes.py       # integration: auth, CRUD, pagination, middleware
│   │   ├── test_state_utils.py  # input_map resolution
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

## Auth testing patterns

```python
# tests/conftest.py — shared fixtures
@pytest.fixture
async def db(tmp_path):
    db_path = str(tmp_path / "test.db")
    run_migrations(db_path)
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    yield conn
    await conn.close()

async def create_test_key(db, scopes=None, name="test-key"):
    # Creates key in DB, returns (ApiKey, raw_key)

# Route integration tests use httpx.AsyncClient + ASGITransport
# ⚠ Does NOT run lifespan — must set app.state.db manually
@pytest.fixture
async def client(tmp_path):
    db = ...  # setup DB
    app.state.db = db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

## Tool testing — no network

```python
from unittest.mock import patch, MagicMock

def test_url_fetch_ssrf_blocked():
    with patch("app.tools.url_fetch.socket.getaddrinfo") as mock:
        mock.return_value = [(None, None, None, None, ("127.0.0.1", 0))]
        error = validate_url("http://localhost/secret")
    assert "blocked" in error.lower()
```

## Migration testing

```python
def test_bad_migration_rolls_back(db_path, monkeypatch):
    run_migrations(db_path)  # apply v1+v2
    # Inject a broken v3 migration via monkeypatch
    with pytest.raises(MigrationError, match="Migration 003 failed"):
        run_migrations(db_path)
    # Version should still be 2
```
