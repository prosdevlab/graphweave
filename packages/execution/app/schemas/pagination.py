"""Pagination models for list endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PaginationParams(BaseModel):
    """Query parameters for paginated list endpoints."""

    limit: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of items to return (1-100).",
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Number of items to skip.",
    )


class PaginatedResponse(BaseModel):
    """Standard paginated response envelope."""

    items: list[Any]
    total: int = Field(description="Total number of items matching the query.")
    limit: int = Field(description="Requested page size.")
    offset: int = Field(description="Number of items skipped.")
    has_more: bool = Field(description="True if there are more items beyond this page.")
