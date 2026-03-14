"""Auth routes — API key management (admin only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import validate_scopes
from app.auth.deps import AuthContext, require_admin
from app.auth.keys import generate_api_key, get_key_display_prefix
from app.db.connection import get_db
from app.db.crud_auth import (
    count_active_admin_keys,
    create_api_key,
    get_api_key,
    list_api_keys,
    revoke_api_key,
)
from app.schemas.auth import CreateKeyRequest, CreateKeyResponse, KeyInfo
from app.schemas.pagination import PaginatedResponse

router = APIRouter(prefix="/v1/auth", tags=["Auth"])


@router.post(
    "/keys",
    response_model=CreateKeyResponse,
    status_code=201,
    summary="Create API key",
    responses={
        422: {"description": "Invalid scopes"},
    },
)
async def create_key(
    body: CreateKeyRequest,
    auth: AuthContext = Depends(require_admin),
    db=Depends(get_db),
) -> CreateKeyResponse:
    """Create a new API key with specified scopes. **Admin only.**

    The raw API key is returned in the response **once** — it cannot
    be retrieved again.  Store it securely.
    """
    try:
        validate_scopes(body.scopes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    raw_key, key_hash = generate_api_key()
    prefix = get_key_display_prefix(raw_key)

    api_key = await create_api_key(db, body.name, key_hash, prefix, body.scopes)

    return CreateKeyResponse(
        id=api_key.id,
        name=api_key.name,
        api_key=raw_key,
        key_prefix=prefix,
        scopes=api_key.scopes,
        created_at=api_key.created_at,
    )


@router.get(
    "/keys",
    response_model=PaginatedResponse,
    summary="List API keys",
)
async def list_keys(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_admin),
    db=Depends(get_db),
) -> PaginatedResponse:
    """List all API keys with pagination. **Admin only.**

    The ``key_hash`` field is never included in responses.
    """
    keys, total = await list_api_keys(db, limit=limit, offset=offset)
    return PaginatedResponse(
        items=[
            KeyInfo(
                id=k.id,
                name=k.name,
                key_prefix=k.key_prefix,
                scopes=k.scopes,
                status=k.status,
                created_at=k.created_at,
                revoked_at=k.revoked_at,
            ).model_dump()
            for k in keys
        ],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.delete(
    "/keys/{key_id}",
    response_model=KeyInfo,
    summary="Revoke API key",
    responses={
        404: {"description": "Key not found"},
        409: {"description": "Cannot revoke last admin key"},
    },
)
async def revoke_key(
    key_id: str,
    auth: AuthContext = Depends(require_admin),
    db=Depends(get_db),
) -> KeyInfo:
    """Revoke an API key by ID. **Admin only.**

    Returns 409 if this is the last active admin-scoped key.
    """
    target = await get_api_key(db, key_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Key not found")

    if "admin" in target.scopes and target.status == "active":
        admin_count = await count_active_admin_keys(db)
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot revoke the last admin key. "
                "Create another admin key first, or use the CLI.",
            )

    revoked = await revoke_api_key(db, key_id)
    if revoked is None:
        raise HTTPException(status_code=404, detail="Key not found")

    return KeyInfo(
        id=revoked.id,
        name=revoked.name,
        key_prefix=revoked.key_prefix,
        scopes=revoked.scopes,
        status=revoked.status,
        created_at=revoked.created_at,
        revoked_at=revoked.revoked_at,
    )
