"""Graph request/response schemas."""

from __future__ import annotations

import warnings

from pydantic import BaseModel, ConfigDict, Field

# Pydantic warns about "schema_json" shadowing BaseModel internals.
# This is our domain field name (matches DB column) — safe to suppress.
warnings.filterwarnings(
    "ignore",
    message='Field name "schema_json"',
    category=UserWarning,
)


class CreateGraphRequest(BaseModel):
    """Request body for creating a new graph."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Graph display name.",
        examples=["Customer Support Bot"],
    )
    schema_json: dict = Field(
        default_factory=dict,
        description="Full GraphSchema document.",
    )


class UpdateGraphRequest(BaseModel):
    """Request body for updating an existing graph."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Updated graph display name.",
    )
    schema_json: dict = Field(description="Updated GraphSchema document.")


class GraphResponse(BaseModel):
    """Graph resource representation."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="Unique graph identifier (UUID).")
    name: str = Field(description="Graph display name.")
    schema_json: dict = Field(description="Full GraphSchema document.")
    owner_id: str = Field(description="API key ID that owns this graph.")
    created_at: str = Field(description="ISO 8601 creation timestamp.")
    updated_at: str = Field(description="ISO 8601 last-modified timestamp.")
