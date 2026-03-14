"""GraphWeave execution layer — FastAPI application."""

from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.db.connection import close_db, get_db_path, init_db
from app.logging import setup_logging

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan — init DB on startup, close on shutdown."""
    # Check LLM keys — warn, don't crash
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

    yield

    await close_db(db)
    logger.info("Database connection closed")


app = FastAPI(title="GraphWeave Execution", version="0.1.0", lifespan=lifespan)

# CORS — explicit origins, not wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    required_keys = ["GEMINI_API_KEY", "OPENAI_API_KEY"]
    llm_configured = any(os.getenv(k) for k in required_keys)
    return {"status": "ok", "llm_configured": llm_configured}


@app.get("/settings/providers")
async def get_providers() -> dict:
    """Return provider configuration status. Never returns key values."""
    return {
        "openai": {"configured": bool(os.getenv("OPENAI_API_KEY")), "models": []},
        "gemini": {"configured": bool(os.getenv("GEMINI_API_KEY")), "models": []},
        "anthropic": {
            "configured": bool(os.getenv("ANTHROPIC_API_KEY")),
            "models": [],
        },
    }
