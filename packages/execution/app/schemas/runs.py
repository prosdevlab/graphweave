"""Pydantic schemas for run routes."""

from __future__ import annotations

from pydantic import BaseModel, Field


class StartRunRequest(BaseModel):
    input: dict = Field(
        default_factory=dict,
        description="Initial input values to merge with state defaults.",
    )


class StartRunResponse(BaseModel):
    run_id: str
    status: str = "running"


class RunStatusResponse(BaseModel):
    run_id: str
    graph_id: str
    status: str  # running | paused | completed | error
    node_id: str | None = None
    prompt: str | None = None
    final_state: dict | None = None
    duration_ms: int | None = None
    error: str | None = None


class RunListItem(BaseModel):
    """Lightweight run representation for list endpoints."""

    id: str
    graph_id: str
    status: str
    input: dict = Field(default_factory=dict)
    duration_ms: int | None = None
    created_at: str
    error: str | None = None


class ResumeRunRequest(BaseModel):
    input: bool | str | dict | list | int | float = Field(
        ...,
        description=(
            "The human input to resume the paused run. "
            "Type depends on the human_input node's input_key state field."
        ),
    )
