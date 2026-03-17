"""GraphWeave execution layer — FastAPI application."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db.connection import close_db, get_db_path, init_db
from app.executor import RunManager
from app.logging import setup_logging
from app.middleware import ContentTypeMiddleware, RequestIDMiddleware
from app.routes.auth import router as auth_router
from app.routes.graphs import router as graphs_router
from app.routes.runs import router as runs_router

setup_logging()
logger = logging.getLogger(__name__)

tags_metadata = [
    {
        "name": "Auth",
        "description": "API key management — create, list, and revoke keys.",
    },
    {
        "name": "Graphs",
        "description": "Graph CRUD — create, read, update, and delete graphs.",
    },
    {
        "name": "Runs",
        "description": "Run execution — start, stream SSE, resume, and status.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — init DB on startup, close on shutdown."""
    required_keys = ["GEMINI_API_KEY", "OPENAI_API_KEY"]
    configured = [k for k in required_keys if os.getenv(k)]
    if not configured:
        logger.warning(
            "No LLM provider key is set. See .env.example. "
            "The server will start but graph execution will fail."
        )

    db_path = get_db_path()
    db = await init_db(db_path)
    app.state.db = db
    logger.info("Database initialized at %s", db_path)

    run_manager = RunManager()
    app.state.run_manager = run_manager
    logger.info("RunManager initialized")

    yield

    await run_manager.cancel_all()
    logger.info("All active runs cancelled")

    await close_db(db)
    logger.info("Database connection closed")


app = FastAPI(
    title="GraphWeave Execution API",
    version="1.0.0",
    description=(
        "Backend API for GraphWeave — visual LangGraph builder.  "
        "Authenticate with an API key via the `X-API-Key` header."
    ),
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)

# ── Middleware (applied bottom-up: last added runs first) ───────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["Content-Type", "X-API-Key", "X-Request-ID", "Last-Event-ID"],
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(ContentTypeMiddleware)

# ── Rate limiting ───────────────────────────────────────────────────────

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],
    headers_enabled=True,
)
app.state.limiter = limiter


# ── Exception handlers ─────────────────────────────────────────────────


async def _http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code},
    )


async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "status_code": 422},
    )


async def _rate_limit_exceeded(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Try again later.",
            "status_code": 429,
        },
    )


app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
app.add_exception_handler(RequestValidationError, _validation_exception_handler)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded)

# ── Routers ─────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(graphs_router)
app.include_router(runs_router)


# ── Root endpoints (unversioned) ────────────────────────────────────────


@app.get("/health", tags=["System"], summary="Health check")
async def health() -> dict:
    """Returns server status, LLM configuration, and auth status."""
    required_keys = ["GEMINI_API_KEY", "OPENAI_API_KEY"]
    llm_configured = any(os.getenv(k) for k in required_keys)
    auth_configured = False
    if hasattr(app.state, "db"):
        cursor = await app.state.db.execute(
            "SELECT COUNT(*) FROM api_keys WHERE status = 'active'"
        )
        row = await cursor.fetchone()
        auth_configured = row[0] > 0
    return {
        "status": "ok",
        "llm_configured": llm_configured,
        "auth_configured": auth_configured,
    }


@app.get("/v1/settings/tools", tags=["System"], summary="Tool registry")
async def get_tools() -> list[dict]:
    """Return available tools with names, descriptions, and parameters."""
    from dataclasses import asdict

    from app.tools.registry import REGISTRY

    return [
        {
            "name": tool.name,
            "description": tool.description,
            "parameters": [asdict(p) for p in tool.parameters],
        }
        for tool in REGISTRY.values()
    ]


@app.get(
    "/v1/settings/providers",
    tags=["System"],
    summary="Provider status",
)
async def get_providers() -> dict:
    """Return provider configuration status. Never returns key values."""
    return {
        "openai": {
            "configured": bool(os.getenv("OPENAI_API_KEY")),
            "models": [],
        },
        "gemini": {
            "configured": bool(os.getenv("GEMINI_API_KEY")),
            "models": [],
        },
        "anthropic": {
            "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
            "models": [],
        },
    }
