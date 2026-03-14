---
name: gw-error-handling
description: "Exception hierarchy for FastAPI, tool error patterns ({ success, recoverable }), LLM call retry/circuit-breaker, React error boundaries, structured logging levels, anti-patterns. Load when adding error handling, exception classes, retry logic, logging, or debugging error flows."
disable-model-invocation: true
---

# Skill: Error Handling

Load this when: adding error handling, defining exceptions, implementing
retry logic, setting up logging, or debugging error flows across Python
or React layers.

---

## Python exception hierarchy

```python
# app/exceptions.py — base class for all application errors

class AppError(Exception):
    """Base for all domain errors. Caught by FastAPI exception handlers."""
    status_code: int = 500
    detail: str = "Internal server error"
    recoverable: bool = False

class NotFoundError(AppError):
    status_code = 404
    def __init__(self, resource: str, id: str):
        self.detail = f"{resource} not found: {id}"

class ValidationError(AppError):
    status_code = 422
    recoverable = True  # caller can fix input and retry

class AuthError(AppError):
    status_code = 401
    detail = "Invalid or missing API key"

class ForbiddenError(AppError):
    status_code = 403
    detail = "Insufficient scope"

class ConflictError(AppError):
    status_code = 409
    recoverable = False  # business rule violation

class ToolExecutionError(AppError):
    status_code = 500
    def __init__(self, tool_name: str, error: str, recoverable: bool = True):
        self.detail = f"Tool '{tool_name}' failed: {error}"
        self.recoverable = recoverable
```

## FastAPI exception handlers

```python
# In main.py — register handlers for consistent error responses

@app.exception_handler(AppError)
async def app_error_handler(request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code},
    )

@app.exception_handler(HTTPException)
async def http_error_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code},
    )

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "status_code": 422},
    )
```

All errors return `{"detail": ..., "status_code": N}`. Never leak stack traces.

## Tool response pattern

Every tool returns `{ success, result/error, recoverable }`:

```python
# Success
{"success": True, "result": {"answer": 42}, "recoverable": True}

# Recoverable failure — executor tells LLM to retry with different inputs
{"success": False, "error": "Invalid date format", "recoverable": True}

# Non-recoverable failure — executor skips tool, logs error
{"success": False, "error": "SSRF blocked: private IP", "recoverable": False}
```

When to set `recoverable`:
- **True**: bad user input, parse errors, rate limits (transient), timeout
- **False**: SSRF violation, tool not found, security violation, broken config

The executor uses `recoverable` to decide whether to include the error in
the LLM's next prompt (recoverable) or abort the tool call (non-recoverable).

## LLM call resilience

```python
# Retry with exponential backoff for transient LLM API errors
import asyncio
from typing import TypeVar, Callable

T = TypeVar("T")

async def retry_llm_call(
    fn: Callable[..., T],
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    retryable_exceptions: tuple = (TimeoutError, ConnectionError),
    **kwargs,
) -> T:
    for attempt in range(max_retries + 1):
        try:
            return await fn(*args, **kwargs)
        except retryable_exceptions as e:
            if attempt == max_retries:
                raise
            delay = base_delay * (2 ** attempt)
            logger.warning("LLM call failed, retrying",
                          attempt=attempt + 1, delay=delay, error=str(e))
            await asyncio.sleep(delay)
```

Retryable errors (retry with backoff):
- `429 Too Many Requests` — provider rate limit
- `500/502/503` — provider transient failure
- `TimeoutError` — network timeout

Non-retryable errors (fail immediately):
- `401/403` — bad API key / permissions
- `400` — malformed request (our bug)
- `404` — invalid model name

Circuit breaker pattern (for provider outages):
- Track consecutive failures per provider
- After N consecutive failures (e.g., 5), mark provider as "open" (unavailable)
- Periodically allow a single probe request to check recovery
- On success, reset failure count and close circuit

## Frontend error handling

### React error boundaries

```tsx
// Wrap major canvas sections — don't let one panel crash the whole app
<ErrorBoundary fallback={<PanelError />}>
  <FlowCanvas />
</ErrorBoundary>

<ErrorBoundary fallback={<PanelError />}>
  <PropertiesPanel />
</ErrorBoundary>
```

Error boundaries catch render errors only. For async errors (API calls, SSE),
handle in the store layer.

### Zustand error state

```typescript
// In store slices — error state per domain
interface GraphSlice {
  graphs: Graph[];
  isLoading: boolean;
  error: string | null;  // null = no error

  loadGraphs: () => Promise<void>;
  clearError: () => void;
}

// Action pattern
loadGraphs: async () => {
  set({ isLoading: true, error: null });
  try {
    const graphs = await api.listGraphs();
    set({ graphs, isLoading: false });
  } catch (e) {
    set({ error: e.message, isLoading: false });
  }
}
```

### SSE error recovery

SSE reconnection is a non-negotiable (see CLAUDE.md). The SSE hook in
gw-frontend handles automatic reconnection with backoff. On disconnect:
1. Set connection status to "reconnecting"
2. Retry with exponential backoff (1s, 2s, 4s, max 30s)
3. On reconnect, request state catchup from `/status` endpoint
4. After max retries, set status to "disconnected" and surface to user

## Structured logging

```python
# app/logging.py — JSON format with contextual fields
{
    "ts": "2025-01-15T10:30:00Z",
    "level": "ERROR",
    "request_id": "abc-123",    # from RequestIDMiddleware
    "run_id": "run-456",        # set during graph execution
    "node_id": "llm_1",         # set during node execution
    "msg": "Tool execution failed: calculator"
}
```

### Log levels guide

| Level | When | Example |
|-------|------|---------|
| **DEBUG** | Internal state, only in dev | "Resolved input_map for node llm_1" |
| **INFO** | Normal operations | "Graph run started", "Migration applied: 002_auth" |
| **WARNING** | Recoverable issues | "LLM call retry attempt 2", "Rate limit approaching" |
| **ERROR** | Failed operations | "Tool execution failed", "Migration failed" |
| **CRITICAL** | Server can't function | "Database init failed", "No LLM providers configured" |

### What to NEVER log

- API keys (raw or hashed)
- User input data / graph schemas (may contain sensitive prompts)
- Full stack traces in production API responses (log them server-side, return generic message)
- Environment variables

## Anti-patterns

```python
# ❌ Bare except — hides bugs
try:
    result = tool.run(inputs)
except:
    pass

# ✅ Catch specific exceptions
try:
    result = tool.run(inputs)
except ToolExecutionError as e:
    logger.error("Tool failed", tool=tool.name, error=str(e))
    return {"success": False, "error": str(e), "recoverable": e.recoverable}

# ❌ Swallowed error — caller never knows something failed
try:
    await save_run(db, run)
except Exception:
    return  # silently lost data

# ✅ Log and propagate
try:
    await save_run(db, run)
except Exception as e:
    logger.error("Failed to save run", run_id=run.id, error=str(e))
    raise

# ❌ Stack trace in API response
@app.exception_handler(Exception)
async def handler(request, exc):
    return JSONResponse(content={"error": traceback.format_exc()})

# ✅ Generic message to client, full trace in server logs
@app.exception_handler(Exception)
async def handler(request, exc):
    logger.exception("Unhandled error", request_id=request.state.request_id)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "status_code": 500},
    )

# ❌ Using HTTP 200 for errors
return JSONResponse(content={"error": "not found"}, status_code=200)

# ✅ Proper status codes
raise NotFoundError("Graph", graph_id)
```
