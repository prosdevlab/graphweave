"""Run routes — stream, resume, status."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.auth.deps import AuthContext, require_scope
from app.db import crud
from app.db.connection import get_db
from app.executor import RunManager, format_sse, stream_run_sse
from app.schemas.runs import ResumeRunRequest, RunStatusResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/runs", tags=["Runs"])


def _get_run_manager(request: Request) -> RunManager:
    return request.app.state.run_manager


# ── Stream ─────────────────────────────────────────────────────────────


@router.get(
    "/{run_id}/stream",
    summary="Stream run events via SSE",
    responses={404: {"description": "Run not found"}},
)
async def stream_run(
    run_id: str,
    request: Request,
    last_event_id: int = Query(default=0, alias="last_event_id"),
    last_event_id_header: str | None = Header(default=None, alias="Last-Event-ID"),
    auth: AuthContext = Depends(require_scope("runs:read")),
    db=Depends(get_db),
) -> StreamingResponse:
    """Open an SSE connection for a run's events."""
    # Parse last_event_id from header (standard SSE) or query param
    event_id = 0
    if last_event_id_header is not None:
        try:
            event_id = int(last_event_id_header)
        except (TypeError, ValueError):
            event_id = 0
    elif last_event_id > 0:
        event_id = last_event_id

    run_manager = _get_run_manager(request)
    ctx = run_manager.get_run(run_id)

    if ctx is not None:
        # Ownership check
        if ctx.owner_id != auth.owner_id and not auth.is_admin:
            raise HTTPException(status_code=404, detail="Run not found")
        return StreamingResponse(
            stream_run_sse(ctx, last_event_id=event_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    # Not in RunManager — check DB
    run = await crud.get_run(db, run_id, owner_id=auth.owner_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    async def _db_fallback() -> AsyncGenerator[str]:
        if run.status == "completed":
            yield format_sse(
                "graph_completed",
                {
                    "final_state": run.final_state or {},
                    "duration_ms": run.duration_ms or 0,
                },
                event_id=1,
            )
        elif run.status == "error":
            yield format_sse(
                "error",
                {
                    "message": run.error or "Unknown error",
                    "recoverable": False,
                },
                event_id=1,
            )
        elif run.status == "paused":
            yield format_sse(
                "graph_paused",
                {
                    "node_id": run.paused_node_id or "unknown",
                    "prompt": run.paused_prompt or "",
                    "run_id": run.id,
                    "input_key": "",
                },
                event_id=1,
            )
        else:
            # running but not in manager = lost
            yield format_sse(
                "error",
                {
                    "message": "Run lost (server restarted)",
                    "recoverable": False,
                },
                event_id=1,
            )

    return StreamingResponse(
        _db_fallback(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Resume ─────────────────────────────────────────────────────────────


@router.post(
    "/{run_id}/resume",
    status_code=202,
    summary="Resume a paused run",
    responses={
        404: {"description": "Run not found"},
        409: {"description": "Run is not paused"},
    },
)
async def resume_run(
    run_id: str,
    body: ResumeRunRequest,
    request: Request,
    auth: AuthContext = Depends(require_scope("runs:write")),
) -> dict:
    """Submit human input to resume a paused run."""
    run_manager = _get_run_manager(request)
    ctx = run_manager.get_run(run_id)

    if ctx is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if ctx.owner_id != auth.owner_id and not auth.is_admin:
        raise HTTPException(status_code=404, detail="Run not found")
    if ctx.status != "paused":
        raise HTTPException(status_code=409, detail="Run is not paused")

    await run_manager.submit_resume(run_id, body.input)
    return {"status": "resumed"}


# ── Status ─────────────────────────────────────────────────────────────


@router.get(
    "/{run_id}/status",
    response_model=RunStatusResponse,
    summary="Get run status",
    responses={404: {"description": "Run not found"}},
)
async def run_status(
    run_id: str,
    request: Request,
    auth: AuthContext = Depends(require_scope("runs:read")),
    db=Depends(get_db),
) -> RunStatusResponse:
    """Get current status of a run (live or from DB)."""
    run_manager = _get_run_manager(request)
    ctx = run_manager.get_run(run_id)

    if ctx is not None:
        if ctx.owner_id != auth.owner_id and not auth.is_admin:
            raise HTTPException(status_code=404, detail="Run not found")
        return RunStatusResponse(
            run_id=ctx.run_id,
            graph_id=ctx.graph_id,
            status=ctx.status,
            node_id=(
                ctx.events[-1]["data"].get("node_id")
                if ctx.status == "paused" and ctx.events
                else None
            ),
            prompt=(
                ctx.events[-1]["data"].get("prompt")
                if ctx.status == "paused" and ctx.events
                else None
            ),
        )

    # Fall back to DB
    run = await crud.get_run(db, run_id, owner_id=auth.owner_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")

    return RunStatusResponse(
        run_id=run.id,
        graph_id=run.graph_id,
        status=run.status,
        node_id=run.paused_node_id,
        prompt=run.paused_prompt,
        final_state=run.final_state,
        duration_ms=run.duration_ms,
        error=run.error,
    )
