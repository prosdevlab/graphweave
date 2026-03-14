# Phase 5: Exporter + Remaining Tools + SSRF Transport

## Context

Phases 1-4 built the full execution pipeline: DB, auth, builder, executor, SSE streaming, and API routes. The graph runs end-to-end. Phase 5 fills two remaining gaps:

1. **Exporter** — the `GET /v1/graphs/{id}/export` route returns 501. Users need standalone Python code they can run outside GraphWeave.
2. **Tools** — 3 of 8 v1 tools are implemented (calculator, datetime, url_fetch). The remaining 5 round out the tool registry.
3. **SSRF hardening** — `url_fetch` has an IP-level SSRF guard but is vulnerable to DNS rebinding. A custom httpx transport pins resolved IPs.

## What exists today

| Component | Status |
|-----------|--------|
| `app/exporter.py` | Stub — returns `"# TODO: implement"` |
| `GET /{graph_id}/export` | Returns 501, ownership-checked |
| `ExportResponse` schema | Defined in `schemas/graphs.py` (code + requirements) |
| `app/tools/base.py` | `BaseTool` ABC with `run(inputs) -> dict` |
| `app/tools/registry.py` | 3 tools: calculator, datetime, url_fetch |
| `app/tools/url_fetch.py` | `validate_url()` blocks private IPs, `follow_redirects=False` |
| Tool response envelope | `{success, result/error, recoverable, source}` |

---

## Part 5.1: SSRF-Hardened Transport

### Problem

`validate_url()` resolves the hostname to check for private IPs, then httpx resolves it again for the actual request. A DNS rebinding attack returns a public IP for validation, then a private IP (e.g., `169.254.169.254`) for the real request.

### Solution

Override DNS resolution at the httpcore level so the pinned IP is used for the actual connection while preserving the original hostname for TLS SNI and the `Host` header. This avoids the naive approach of replacing the URL host with an IP (which breaks HTTPS certificate validation).

**New file**: `app/tools/ssrf_transport.py`

```python
import httpcore
from httpcore._backends.sync import SyncBackend

class PinnedDNSBackend(httpcore.NetworkBackend):
    """Network backend that substitutes hostname with a pinned IP in connect_tcp.

    Wraps the default SyncBackend. When connect_tcp is called, replaces the
    `host` parameter with the pinned IP while leaving everything else
    unchanged. This means:
    - TCP connection goes to the pinned IP (SSRF-safe)
    - TLS SNI uses the original hostname (httpcore passes it separately)
    - Host header uses the original hostname (httpx sets it from the URL)
    """

    def __init__(self, pinned_ip: str):
        self._pinned_ip = pinned_ip
        self._backend = SyncBackend()

    def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        # Substitute host with pinned IP — all other params (including SNI) unchanged
        return self._backend.connect_tcp(
            self._pinned_ip, port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )
```

```python
import httpx
import httpcore

class SSRFSafeTransport(httpx.HTTPTransport):
    """httpx transport that pins DNS to a pre-validated IP.

    Subclasses HTTPTransport to inherit its handle_request method, which
    correctly converts between httpx.Request/Response and httpcore types.
    We only replace the internal connection pool with one using our
    PinnedDNSBackend.
    """

    def __init__(self, pinned_ip: str, **kwargs):
        super().__init__(**kwargs)
        # Preserve ssl_context from the pool created by super().__init__
        # (respects verify=, cert=, trust_env= kwargs). Then replace the
        # pool with one using our pinned DNS backend.
        existing_pool = self._pool
        self._pool = httpcore.ConnectionPool(
            ssl_context=existing_pool._ssl_context,
            network_backend=PinnedDNSBackend(pinned_ip),
        )
```

**Why subclass `HTTPTransport` instead of `BaseTransport`**: `HTTPTransport.handle_request` converts `httpx.Request` → `httpcore.Request`, calls `self._pool.handle_request()`, then converts `httpcore.Response` → `httpx.Response`. If we subclassed `BaseTransport`, we'd need to replicate this conversion logic (including private imports like `map_httpcore_exceptions` and `ResponseStream`). Subclassing `HTTPTransport` and replacing `self._pool` gives us the correct conversion for free.

Flow:
1. `validate_url()` resolves hostname → returns `(error, resolved_ip)` tuple
2. `SSRFSafeTransport(pinned_ip)` creates a `ConnectionPool` with `PinnedDNSBackend`
3. `PinnedDNSBackend.connect_tcp()` substitutes the host with the pinned IP
4. TLS SNI and `Host` header use the original hostname (httpx/httpcore handle this from the URL, not from `connect_tcp`'s host param)
5. Works correctly for both HTTP and HTTPS

Changes to `url_fetch.py`:
- `validate_url()` returns `tuple[str | None, str | None]` — `(error, resolved_ip)`
- `UrlFetchTool.run()` creates `httpx.Client(transport=SSRFSafeTransport(resolved_ip))`
- **Existing tests in `tests/unit/test_tools/test_url_fetch.py` must be updated** to handle the new tuple return type

### Tests

| Test | What it verifies |
|------|-----------------|
| `test_backend_connect_tcp_receives_pinned_ip` | `PinnedDNSBackend.connect_tcp` called with pinned IP, not original hostname |
| `test_transport_end_to_end_with_httpx_client` | Real `httpx.Client(transport=SSRFSafeTransport(...))` completes a request — catches type conversion bugs |
| `test_transport_sets_host_header` | Original hostname in Host header for virtual hosting |
| `test_transport_https_sni_correct` | TLS SNI uses original hostname, not pinned IP — cert validation passes |
| `test_validate_url_returns_tuple` | Updated return type `(error, resolved_ip)` |
| `test_existing_ssrf_guards_unchanged` | Private IP, loopback, link-local still blocked |
| `test_transport_preserves_ssl_context` | `SSRFSafeTransport(verify=False)` forwards ssl_context to replacement pool |
| `test_url_fetch_existing_tests_updated` | All existing url_fetch tests pass with tuple return |

---

## Part 5.2: Remaining Tools (5 tools)

All tools follow the existing pattern: extend `BaseTool`, implement `run(inputs) -> dict`, return the response envelope.

### 5.2.1 `web_search`

**File**: `app/tools/web_search.py`

| Input | Type | Description |
|-------|------|-------------|
| `query` | str | Search query |
| `max_results` | int | Max results (default 5, max 10) |

**Behavior**:
- If `TAVILY_API_KEY` env var is set → use Tavily API (`tavily-python`)
- If not set → fall back to DuckDuckGo (`duckduckgo-search`, no API key needed)
- Returns list of `{title, url, snippet}` as the result string (formatted)
- `max_results` clamped to 10 regardless of input
- 10-second timeout on both providers
- `recoverable: True` on timeout/network errors
- `recoverable: False` on empty query

**Dependencies**: `tavily-python>=0.5.0,<1.0`, `duckduckgo-search>=6.0.0,<8.0`

**Note on duckduckgo-search**: The API changed between major versions. Implementation must verify the actual `DDGS` class interface against the installed version. Pin to `>=6.0.0,<8.0` and add a comment documenting the expected method signature (`DDGS().text(query, max_results=N)`).

### 5.2.2 `wikipedia`

**File**: `app/tools/wikipedia_tool.py`

| Input | Type | Description |
|-------|------|-------------|
| `query` | str | Search term |
| `action` | str | `"search"` (list titles) or `"page"` (get content) |
| `title` | str | Page title (required for `action=page`) |

**Behavior**:
- `action=search` → calls MediaWiki opensearch API directly via httpx:
  `https://en.wikipedia.org/w/api.php?action=opensearch&search={query}&limit=5&format=json`
  Returns list of matching titles (max 5). No extra library needed — plain httpx GET.
- `action=page` → uses `wikipediaapi` (PyPI: `Wikipedia-API`).
  **Must initialize with `user_agent`** (mandatory since v0.6.0):
  ```python
  wiki = wikipediaapi.Wikipedia(language="en", user_agent="GraphWeave/1.0")
  page = wiki.page(title)
  ```
  Returns page summary + first 10K chars of content.
- `recoverable: True` on network errors
- `recoverable: False` on page not found or missing title for `action=page`

**Note**: `wikipediaapi` only supports page retrieval, not search. The `action=search` path uses the MediaWiki opensearch API directly via httpx, avoiding a second Wikipedia library.

**Dependencies**: `Wikipedia-API>=0.7.0`

### 5.2.3 `file_read`

**File**: `app/tools/file_read.py`

| Input | Type | Description |
|-------|------|-------------|
| `path` | str | File path relative to `/workspace` |

**Behavior**:
- Sandboxed to `/workspace` directory (configurable via `FILE_SANDBOX_ROOT` env var, default `/workspace`)
- Path traversal prevention: resolve path, verify it starts with sandbox root
- Opens files with `O_NOFOLLOW` flag to prevent symlink-based TOCTOU attacks (see Sandbox section)
- Reads with explicit `encoding="utf-8"` — binary files not supported (v2)
- Max file size: 1MB — returns `recoverable: False` if exceeded
- Returns file content as string (10K char truncation like url_fetch)
- `truncated: True` if content was truncated
- `recoverable: False` on permission error, file not found, path traversal, encoding error

### 5.2.4 `file_write`

**File**: `app/tools/file_write.py`

| Input | Type | Description |
|-------|------|-------------|
| `path` | str | File path relative to `/workspace` |
| `content` | str | Content to write (text only, UTF-8) |
| `mode` | str | `"overwrite"` (default) or `"append"` |

**Behavior**:
- Same sandbox as `file_read` (`FILE_SANDBOX_ROOT`)
- Path traversal prevention (same as file_read)
- Opens files with `O_NOFOLLOW` flag (see Sandbox section)
- Writes with explicit `encoding="utf-8"` — binary content not supported (v2)
- Creates parent directories if needed
- Max content size: 1MB — `recoverable: False` if exceeded
- Returns `{success: True, result: "Written N bytes to path"}`
- `recoverable: False` on permission error, path traversal, encoding error

### 5.2.5 `weather`

**File**: `app/tools/weather.py`

| Input | Type | Description |
|-------|------|-------------|
| `location` | str | City name or "lat,lon" |
| `action` | str | `"current"` or `"forecast"` (default: `"current"`) |

**Behavior**:
- Uses Open-Meteo API (free, no key required)
- Step 1: If `location` matches `"lat,lon"` pattern → skip geocoding, use directly
- Step 2: Otherwise geocode location name via Open-Meteo geocoding API → lat/lon
- Step 3: Fetch weather data from Open-Meteo forecast API
- `action=current` → temperature, humidity, wind, conditions
- `action=forecast` → 7-day daily forecast (high/low, conditions)
- 10-second timeout
- Open-Meteo URLs are hardcoded public API endpoints (no SSRF risk — not user-influenced)
- `recoverable: True` on timeout/network errors
- `recoverable: False` on unknown location

**Dependencies**: None extra — uses httpx (already a dependency)

### Shared: File sandbox utility

**File**: `app/tools/sandbox.py`

Shared between `file_read` and `file_write`:

```python
def resolve_sandboxed_path(path: str, sandbox_root: str) -> str | None:
    """Resolve path within sandbox. Returns absolute path or None if escaped."""
```

**TOCTOU mitigation**: The sandbox uses a two-layer defense:

1. **`os.path.realpath()` pre-check** — resolves symlinks and verifies the resolved path starts with `sandbox_root`. Rejects obvious traversal attempts.
2. **`O_NOFOLLOW` on open** — file_read and file_write open files with `os.O_NOFOLLOW`, which refuses to follow symlinks at the final path component. This prevents a TOCTOU race where a symlink is swapped between validation and open.

**Additional context**: `/workspace` is an ephemeral per-run Docker volume. Each graph execution gets its own isolated `/workspace`. There is no persistent attacker presence across runs, which significantly limits the TOCTOU window. The `O_NOFOLLOW` defense is belt-and-suspenders.

```python
def open_sandboxed(
    path: str, sandbox_root: str, flags: int, mode: int = 0o644
) -> int:
    """Open a file within the sandbox with O_NOFOLLOW. Returns fd or raises."""
```

**Note**: `O_NOFOLLOW` only applies to the final path component (the leaf). Parent directory symlink traversal is prevented by the `os.path.realpath()` pre-check, which must always run first.

**I/O pattern for callers**:
- `file_write`: Call `os.makedirs(parent, exist_ok=True)` before `open_sandboxed` to create parent directories. Wrap the raw fd with `os.fdopen(fd, "w", encoding="utf-8")` to get a proper file object for string writes.
- `file_read`: Wrap the raw fd with `os.fdopen(fd, "r", encoding="utf-8")`. Non-UTF-8 files will raise `UnicodeDecodeError` → return `recoverable: False`.

### Registry update

Add all 5 to `REGISTRY` in `registry.py`.

### Tests per tool

Each tool gets its own test file in `tests/unit/`:

| Tool | Tests | Key scenarios |
|------|-------|---------------|
| `web_search` | 6 | Tavily path, DDG fallback, empty query, timeout, max_results clamped to 10, max_results within range |
| `wikipedia` | 6 | Search results, page content, disambiguation error, not found, truncation, user_agent set |
| `file_read` | 7 | Read file, path traversal blocked, file not found, too large, truncation, symlink escape (O_NOFOLLOW), empty file |
| `file_write` | 8 | Write file, append mode, path traversal blocked, creates dirs, too large, symlink escape (O_NOFOLLOW), encoding error on non-UTF-8, symlink in parent directory |
| `weather` | 5 | Current weather, forecast, unknown location, timeout, lat/lon input format (skip geocoding) |
| `registry` | 1 | `test_registry_has_all_eight_tools` — assert `len(REGISTRY) == 8` and each name exists |
| `file roundtrip` | 1 | `test_file_roundtrip_write_then_read` — write via file_write, read back via file_read, assert match |

`web_search` tests mock the Tavily/DDG clients. `weather` tests mock httpx responses. File tools use `tmp_path` fixture with `FILE_SANDBOX_ROOT` monkeypatched.

---

## Part 5.3: Exporter

### What it generates

The exporter takes a `GraphSchema` dict and produces standalone Python code that recreates the graph using LangGraph directly — no GraphWeave dependency needed.

**Output structure** (uses `TypedDict` — standard LangGraph pattern):

```python
"""Generated by GraphWeave — standalone LangGraph graph."""

import operator
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI
# ... other imports based on graph content


class GraphState(TypedDict):
    messages: Annotated[list, ...]
    result: str


# Node functions
async def llm_node_1(state: GraphState) -> dict:
    ...

def tool_node_1(state: GraphState) -> dict:
    ...


# Build graph
graph = StateGraph(GraphState)
graph.add_node("llm_1", llm_node_1)
...
graph.add_edge(START, "llm_1")
...
compiled = graph.compile()


# Run
if __name__ == "__main__":
    import asyncio
    result = asyncio.run(compiled.ainvoke({...defaults...}))
    print(result)
```

**Key difference from builder**: The builder uses `type()` with `__annotations__` (dynamic, works at runtime). The exporter generates `TypedDict` subclass source code (static, matches LangGraph docs and user expectations).

### Implementation: `app/exporter.py`

```python
def export_graph(schema: dict) -> dict:
    """Generate standalone Python code from a GraphSchema."""
    # Returns {"code": str, "requirements": str}
```

Code generation sections (in order):
1. **Imports** — scan nodes to determine which imports are needed (langchain providers, tools, etc.)
2. **State class** — generate `class GraphState(TypedDict)` with annotations matching the schema
3. **Node functions** — generate function bodies for each non-start/non-end node
4. **Graph construction** — `StateGraph(GraphState)`, `add_node`, `add_edge`, `add_conditional_edges`
5. **Compilation** — `graph.compile()`, with checkpointer comment if human_input nodes present
6. **Main block** — `if __name__ == "__main__"` with defaults-merged invocation

**Requirements generation**: Scan the schema for:
- Base: `langgraph`, `langchain-core`
- LLM providers used → `langchain-openai`, `langchain-anthropic`, `langchain-google-genai`
- Tools used → `simpleeval` (calculator), `httpx` + `trafilatura` (url_fetch), etc.
- No LLM nodes → no provider deps in requirements

### Route update

Change `GET /{graph_id}/export` from 501 stub to return `ExportResponse`:

```python
@router.get("/{graph_id}/export", response_model=ExportResponse)
async def export_graph_route(...):
    result = export_graph(graph.schema_json)
    return ExportResponse(code=result["code"], requirements=result["requirements"])
```

### Tests

| Test | What it verifies |
|------|-----------------|
| `test_export_linear_graph` | start → llm → end produces valid Python |
| `test_export_with_tool_node` | Tool node generates correct function body |
| `test_export_with_condition` | Condition generates routing function + `add_conditional_edges` |
| `test_export_with_human_input` | Includes interrupt import + checkpointer comment |
| `test_export_requirements_openai` | Requirements include `langchain-openai` |
| `test_export_requirements_multi_provider` | Multiple providers listed |
| `test_export_requirements_no_llm` | Tool-only graph has no provider deps |
| `test_export_state_typeddict` | State class is `TypedDict` subclass with correct annotations |
| `test_export_code_compiles` | `compile(exported_code)` doesn't raise SyntaxError |
| `test_export_code_ast_structure` | `ast.parse()` + `ast.walk()` verifies expected function defs, class defs, imports |
| `test_export_complex_graph` | Graph with LLM + tool + condition + human_input — all node types combined |
| `test_export_route_returns_200` | Route returns ExportResponse, not 501 |
| `test_export_route_not_found` | 404 for nonexistent graph |

---

## Commit Checkpoints

| Checkpoint | What's in it |
|------------|-------------|
| 1 | SSRF transport + updated url_fetch + updated existing url_fetch tests |
| 2 | File sandbox utility + file_read + file_write + tests (including roundtrip) |
| 3 | web_search + wikipedia + tests |
| 4 | weather tool + registry count test + tests |
| 5 | Exporter implementation + tests |
| 6 | Export route update (501 → 200) + integration test |

---

## Dependencies to add

```toml
# pyproject.toml
"tavily-python>=0.5.0,<1.0",
"duckduckgo-search>=6.0.0,<8.0",
"Wikipedia-API>=0.7.0",
```

---

## Files Summary

| Action | File |
|--------|------|
| CREATE | `app/tools/ssrf_transport.py` |
| CREATE | `app/tools/web_search.py` |
| CREATE | `app/tools/wikipedia_tool.py` |
| CREATE | `app/tools/file_read.py` |
| CREATE | `app/tools/file_write.py` |
| CREATE | `app/tools/weather.py` |
| CREATE | `app/tools/sandbox.py` |
| CREATE | `tests/unit/test_ssrf_transport.py` |
| CREATE | `tests/unit/test_web_search.py` |
| CREATE | `tests/unit/test_wikipedia.py` |
| CREATE | `tests/unit/test_file_read.py` |
| CREATE | `tests/unit/test_file_write.py` |
| CREATE | `tests/unit/test_weather.py` |
| CREATE | `tests/unit/test_exporter.py` |
| MODIFY | `app/tools/url_fetch.py` — use SSRFSafeTransport, update validate_url return type |
| MODIFY | `app/tools/registry.py` — register 5 new tools |
| MODIFY | `app/exporter.py` — full implementation |
| MODIFY | `app/routes/graphs.py` — export route 501 → 200 |
| MODIFY | `tests/unit/test_tools/test_url_fetch.py` — update for tuple return type |
| MODIFY | `pyproject.toml` — add 3 dependencies |
| REGEN | `uv.lock` |

---

## Verification

```bash
cd packages/execution
uv sync
uv run ruff check app/ tests/
uv run ruff format --check app/ tests/
uv run pytest tests/unit/ -v
```

---

## Not in scope

- Tool parameter configuration in schema (v2 — per-tool config UI in canvas)
- Image/media tools (v2)
- Database tools (v2 — multi-tenant safety unclear)
- Binary file I/O (v2 — file_read/file_write are UTF-8 text only)
- Persistent file storage across runs (files live in `/workspace` per-run, ephemeral in Docker)
- Export to other formats (Jupyter notebook, etc.)
