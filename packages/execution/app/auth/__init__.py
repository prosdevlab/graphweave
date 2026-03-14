"""Auth module — scope constants and validation."""

from __future__ import annotations

SCOPES_DEFAULT = ["graphs:read", "graphs:write", "runs:read", "runs:write"]
SCOPES_ADMIN = [*SCOPES_DEFAULT, "admin"]
ALL_SCOPES = set(SCOPES_ADMIN)


def validate_scopes(scopes: list[str]) -> None:
    """Raise ValueError if any scope is not recognised."""
    invalid = set(scopes) - ALL_SCOPES
    if invalid:
        raise ValueError(f"Unknown scopes: {invalid}")
