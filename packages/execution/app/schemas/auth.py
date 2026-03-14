"""Auth request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CreateKeyRequest(BaseModel):
    """Request body for creating a new API key."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Human-readable label for the key.",
        examples=["CI Pipeline"],
    )
    scopes: list[str] = Field(
        ...,
        description="Scopes to grant. Use valid scope strings.",
        examples=[["graphs:read", "graphs:write"]],
    )


class CreateKeyResponse(BaseModel):
    """Response after creating an API key. The raw key is shown ONCE."""

    id: str = Field(description="Unique key identifier (UUID).")
    name: str = Field(description="Key label.")
    api_key: str = Field(
        description="Raw API key — save this, it will not be shown again.",
        examples=["gw_a1b2c3d4e5f6..."],
    )
    key_prefix: str = Field(
        description="First 10 characters for identification.",
        examples=["gw_a1b2c3d"],
    )
    scopes: list[str] = Field(description="Granted scopes.")
    created_at: str = Field(description="ISO 8601 creation timestamp.")


class KeyInfo(BaseModel):
    """API key metadata — key_hash is never exposed."""

    id: str = Field(description="Unique key identifier (UUID).")
    name: str = Field(description="Key label.")
    key_prefix: str = Field(description="First 10 characters for identification.")
    scopes: list[str] = Field(description="Granted scopes.")
    status: str = Field(description="Key status: active or revoked.")
    created_at: str = Field(description="ISO 8601 creation timestamp.")
    revoked_at: str | None = Field(
        default=None, description="ISO 8601 revocation timestamp, if revoked."
    )
