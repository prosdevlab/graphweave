"""Shared response models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    """Standard error response — returned by all exception handlers."""

    detail: str | list = Field(
        description="Error description or validation error list."
    )
    status_code: int = Field(description="HTTP status code.")
