"""Graph routes — CRUD with scope-based auth and tenant isolation."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from langgraph.checkpoint.memory import InMemorySaver

from app.auth.deps import AuthContext, require_scope
from app.builder import GraphBuildError, build_graph
from app.db import crud
from app.db.connection import get_db
from app.schemas.graphs import (
    CreateGraphRequest,
    GraphResponse,
    UpdateGraphRequest,
)
from app.schemas.pagination import PaginatedResponse
from app.schemas.runs import StartRunRequest, StartRunResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/graphs", tags=["Graphs"])


def _owner_filter(auth: AuthContext) -> str | None:
    """Return owner_id for CRUD filtering, or None for admin (sees all)."""
    return None if auth.is_admin else auth.owner_id


def _graph_response(graph) -> GraphResponse:
    return GraphResponse(
        id=graph.id,
        name=graph.name,
        schema_json=graph.schema_json,
        owner_id=graph.owner_id,
        created_at=graph.created_at,
        updated_at=graph.updated_at,
    )


@router.post(
    "",
    response_model=GraphResponse,
    status_code=201,
    summary="Create graph",
)
async def create_graph(
    body: CreateGraphRequest,
    auth: AuthContext = Depends(require_scope("graphs:write")),
    db=Depends(get_db),
) -> GraphResponse:
    """Create a new graph owned by the authenticated API key."""
    graph = await crud.create_graph(
        db, body.name, body.schema_json, owner_id=auth.owner_id
    )
    return _graph_response(graph)


@router.get(
    "",
    response_model=PaginatedResponse,
    summary="List graphs",
)
async def list_graphs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_scope("graphs:read")),
    db=Depends(get_db),
) -> PaginatedResponse:
    """List graphs owned by the authenticated key.

    Admin keys see all graphs across all owners.
    """
    graphs, total = await crud.list_graphs(
        db,
        owner_id=_owner_filter(auth),
        limit=limit,
        offset=offset,
    )
    return PaginatedResponse(
        items=[_graph_response(g).model_dump() for g in graphs],
        total=total,
        limit=limit,
        offset=offset,
        has_more=(offset + limit) < total,
    )


@router.get(
    "/{graph_id}",
    response_model=GraphResponse,
    summary="Get graph",
    responses={404: {"description": "Graph not found"}},
)
async def get_graph(
    graph_id: str,
    auth: AuthContext = Depends(require_scope("graphs:read")),
    db=Depends(get_db),
) -> GraphResponse:
    """Get a single graph by ID.

    Returns 404 if the graph doesn't exist or belongs to another key.
    """
    graph = await crud.get_graph(db, graph_id, owner_id=_owner_filter(auth))
    if graph is None:
        raise HTTPException(status_code=404, detail="Graph not found")
    return _graph_response(graph)


@router.put(
    "/{graph_id}",
    response_model=GraphResponse,
    summary="Update graph",
    responses={404: {"description": "Graph not found"}},
)
async def update_graph(
    graph_id: str,
    body: UpdateGraphRequest,
    auth: AuthContext = Depends(require_scope("graphs:write")),
    db=Depends(get_db),
) -> GraphResponse:
    """Update a graph's name and schema."""
    graph = await crud.update_graph(
        db,
        graph_id,
        body.name,
        body.schema_json,
        owner_id=_owner_filter(auth),
    )
    if graph is None:
        raise HTTPException(status_code=404, detail="Graph not found")
    return _graph_response(graph)


@router.delete(
    "/{graph_id}",
    status_code=204,
    summary="Delete graph",
    responses={404: {"description": "Graph not found"}},
)
async def delete_graph(
    graph_id: str,
    auth: AuthContext = Depends(require_scope("graphs:write")),
    db=Depends(get_db),
) -> Response:
    """Delete a graph by ID. Returns 204 on success with no body."""
    deleted = await crud.delete_graph(db, graph_id, owner_id=_owner_filter(auth))
    if not deleted:
        raise HTTPException(status_code=404, detail="Graph not found")
    return Response(status_code=204)


# ── Run ────────────────────────────────────────────────────────────────


def _get_run_manager(request: Request):
    return request.app.state.run_manager


@router.post(
    "/{graph_id}/run",
    response_model=StartRunResponse,
    status_code=202,
    summary="Start graph execution",
    responses={
        404: {"description": "Graph not found"},
        422: {"description": "Schema build error"},
        429: {"description": "Concurrent run limit reached"},
    },
)
async def start_run(
    graph_id: str,
    body: StartRunRequest,
    request: Request,
    auth: AuthContext = Depends(require_scope("runs:write")),
    db=Depends(get_db),
) -> StartRunResponse:
    """Start a new graph execution run."""
    graph = await crud.get_graph(db, graph_id, owner_id=_owner_filter(auth))
    if graph is None:
        raise HTTPException(status_code=404, detail="Graph not found")

    saver = InMemorySaver()
    try:
        result = build_graph(graph.schema_json, checkpointer=saver)
    except GraphBuildError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    run = await crud.create_run(db, graph_id, auth.owner_id, "running", body.input)

    run_manager = _get_run_manager(request)
    config = {"configurable": {"thread_id": run.id}}
    # NOTE: db is app.state.db (long-lived connection), safe for background
    # tasks. If get_db ever becomes request-scoped, pass app.state.db instead.
    try:
        await run_manager.start_run(
            run_id=run.id,
            graph_id=graph_id,
            owner_id=auth.owner_id,
            compiled_graph=result.graph,
            config=config,
            input_data=body.input,
            defaults=result.defaults,
            schema_dict=graph.schema_json,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    return StartRunResponse(run_id=run.id)
