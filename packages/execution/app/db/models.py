"""Database models for graph storage and run history."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ApiKey:
    """A standalone API key — key = identity."""

    id: str
    name: str
    key_hash: str
    key_prefix: str  # first 10 chars for display
    scopes: list[str] = field(default_factory=list)
    status: str = "active"  # active | revoked
    created_at: str = ""
    revoked_at: str | None = None


@dataclass
class Graph:
    """A saved graph with its full GraphSchema."""

    id: str
    name: str
    schema_json: dict = field(default_factory=dict)
    owner_id: str = ""
    created_at: str = ""
    updated_at: str = ""


@dataclass
class Run:
    """A single graph execution run."""

    id: str
    graph_id: str
    status: str  # running | completed | paused | error
    owner_id: str = ""
    input: dict = field(default_factory=dict)
    final_state: dict | None = None
    duration_ms: int | None = None
    created_at: str = ""
    error: str | None = None
    paused_node_id: str | None = None
    paused_prompt: str | None = None
