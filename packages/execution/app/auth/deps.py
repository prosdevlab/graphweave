"""FastAPI authentication dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import APIKeyHeader

from app.auth.keys import hash_key
from app.db.connection import get_db
from app.db.crud_auth import get_api_key_by_hash

api_key_header = APIKeyHeader(name="X-API-Key")


@dataclass
class AuthContext:
    """Injected into route handlers via ``Depends()``."""

    owner_id: str  # api_key.id
    scopes: list[str]
    key_name: str

    @property
    def is_admin(self) -> bool:
        return "admin" in self.scopes


async def require_auth(
    raw_key: str = Depends(api_key_header),
    db=Depends(get_db),
) -> AuthContext:
    """Validate the ``X-API-Key`` header and return an :class:`AuthContext`.

    Raises 401 if the key is missing (handled by ``APIKeyHeader``),
    invalid, or revoked.
    """
    key_hash = hash_key(raw_key)
    api_key = await get_api_key_by_hash(db, key_hash)
    if api_key is None:
        raise HTTPException(status_code=401, detail="Invalid API key")
    if api_key.status != "active":
        raise HTTPException(status_code=401, detail="API key has been revoked")
    return AuthContext(
        owner_id=api_key.id,
        scopes=api_key.scopes,
        key_name=api_key.name,
    )


def require_scope(scope: str):
    """Return a dependency that checks *scope* is in the key's scopes."""

    async def _check(auth: AuthContext = Depends(require_auth)) -> AuthContext:
        if scope not in auth.scopes:
            raise HTTPException(
                status_code=403, detail=f"Missing required scope: {scope}"
            )
        return auth

    return _check


require_admin = require_scope("admin")
