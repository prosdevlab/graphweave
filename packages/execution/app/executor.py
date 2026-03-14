"""Run management and SSE streaming."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command

from app.db.crud import update_run

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def format_sse(event: str, data: dict, event_id: int | None = None) -> str:
    """Format a server-sent event string.

    Args:
        event: SSE event type (e.g. "node_completed").
        data: JSON-serializable dict for the data field.
        event_id: Sequential ID for reconnection. If None, no id: line
                  is emitted (used for keepalive events).
    """
    parts: list[str] = []
    if event_id is not None:
        parts.append(f"id: {event_id}")
    parts.append(f"event: {event}")
    parts.append(f"data: {json.dumps(data, default=str)}")
    parts.append("")  # trailing newline
    return "\n".join(parts) + "\n"


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def _elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)


# ---------------------------------------------------------------------------
# RunContext
# ---------------------------------------------------------------------------


@dataclass
class RunContext:
    """Tracks a single active run's state, queue, and metadata."""

    run_id: str
    graph_id: str
    owner_id: str
    queue: asyncio.Queue[dict | None]  # SSE events or None sentinel
    task: asyncio.Task | None
    cancel_event: asyncio.Event
    status: str  # running | paused | completed | error
    started_at: float  # time.monotonic()
    resume_event: asyncio.Event
    compiled_graph: CompiledStateGraph
    resume_value: Any = None
    config: dict = field(default_factory=dict)
    events: list[dict] = field(default_factory=list)
    event_counter: int = 0  # monotonic counter for SSE id: field
    schema_dict: dict = field(default_factory=dict)
    total_pause_time: float = 0.0  # excluded from timeout
    paused_node_id: str | None = None
    paused_prompt: str | None = None


# ---------------------------------------------------------------------------
# Emit helpers
# ---------------------------------------------------------------------------


def _emit(ctx: RunContext, event: str, data: dict) -> None:
    """Push an SSE event to the run's queue and buffer with sequential ID.

    Must only be called from the asyncio event loop thread.
    Sync node functions must NOT call this directly.
    """
    ctx.event_counter += 1
    event_dict = {"id": ctx.event_counter, "event": event, "data": data}
    ctx.events.append(event_dict)
    try:
        ctx.queue.put_nowait(event_dict)
    except asyncio.QueueFull:
        logger.warning(
            "SSE queue full for run %s (event %d dropped from live stream, "
            "available in replay buffer)",
            ctx.run_id,
            ctx.event_counter,
        )


def _emit_keepalive(ctx: RunContext) -> None:
    """Emit a keepalive event with no ID (not buffered for replay)."""
    event_dict: dict = {"id": None, "event": "keepalive", "data": {}}
    with contextlib.suppress(asyncio.QueueFull):
        ctx.queue.put_nowait(event_dict)


async def _safe_update_run(db: Any, run_id: str, **fields: Any) -> None:
    """Update run in DB, logging but not raising on failure."""
    try:
        await update_run(db, run_id, **fields)
    except Exception:
        logger.exception("Failed to update run %s in DB", run_id)


# ---------------------------------------------------------------------------
# RunManager
# ---------------------------------------------------------------------------


class RunManager:
    """Manages active runs with concurrent limits and lifecycle."""

    def __init__(self) -> None:
        self._runs: dict[str, RunContext] = {}
        self._max_per_key: int = int(os.getenv("MAX_RUNS_PER_KEY", "3"))
        self._max_global: int = int(os.getenv("MAX_RUNS_GLOBAL", "10"))
        self._run_timeout: int = int(os.getenv("RUN_TIMEOUT_SECONDS", "300"))

    def get_run(self, run_id: str) -> RunContext | None:
        return self._runs.get(run_id)

    def active_count_for_owner(self, owner_id: str) -> int:
        return sum(
            1
            for r in self._runs.values()
            if r.owner_id == owner_id and r.status in ("running", "paused")
        )

    def active_count_global(self) -> int:
        return sum(1 for r in self._runs.values() if r.status in ("running", "paused"))

    async def start_run(
        self,
        *,
        run_id: str,
        graph_id: str,
        owner_id: str,
        compiled_graph: CompiledStateGraph,
        config: dict,
        input_data: dict,
        defaults: dict,
        schema_dict: dict,
        db: Any,
    ) -> RunContext:
        # Check concurrent limits
        if self.active_count_for_owner(owner_id) >= self._max_per_key:
            msg = f"Concurrent run limit ({self._max_per_key}) reached for owner"
            raise ValueError(msg)
        if self.active_count_global() >= self._max_global:
            msg = f"Global concurrent run limit ({self._max_global}) reached"
            raise ValueError(msg)

        ctx = RunContext(
            run_id=run_id,
            graph_id=graph_id,
            owner_id=owner_id,
            queue=asyncio.Queue(maxsize=1000),
            task=None,
            cancel_event=asyncio.Event(),
            status="running",
            started_at=time.monotonic(),
            resume_event=asyncio.Event(),
            compiled_graph=compiled_graph,
            config=config,
            schema_dict=schema_dict,
        )
        ctx.task = asyncio.create_task(
            _execute_run(ctx, input_data, defaults, db, self._run_timeout, self)
        )
        self._runs[run_id] = ctx
        return ctx

    async def cancel_run(self, run_id: str) -> bool:
        ctx = self._runs.get(run_id)
        if ctx is None:
            return False
        ctx.cancel_event.set()
        # Unblock _wait_for_resume so the cancel is detected
        ctx.resume_event.set()
        return True

    async def submit_resume(self, run_id: str, value: Any) -> bool:
        ctx = self._runs.get(run_id)
        if ctx is None or ctx.status != "paused":
            return False
        ctx.resume_value = value
        ctx.resume_event.set()
        return True

    def cleanup_run(self, run_id: str) -> None:
        """Remove run from tracking. Idempotent."""
        self._runs.pop(run_id, None)

    async def cancel_all(self) -> None:
        """Cancel all active runs. Used during shutdown."""
        for run_id in list(self._runs):
            await self.cancel_run(run_id)


# ---------------------------------------------------------------------------
# Core execution
# ---------------------------------------------------------------------------


async def _execute_run(
    ctx: RunContext,
    input_data: dict,
    defaults: dict,
    db: Any,
    run_timeout: int,
    run_manager: RunManager,
) -> None:
    """Background task. Never raises — errors become SSE events."""
    run_start = time.monotonic()
    ctx.started_at = run_start
    try:
        _emit(ctx, "run_started", {"run_id": ctx.run_id, "timestamp": _utcnow_iso()})
        initial_state = {**defaults, **input_data}
        await _stream_graph(ctx, initial_state, db, run_timeout)
    except asyncio.CancelledError:
        _emit(ctx, "error", {"message": "Run cancelled", "recoverable": False})
        ctx.status = "error"
        await _safe_update_run(
            db,
            ctx.run_id,
            status="error",
            error="Cancelled",
            duration_ms=_elapsed_ms(run_start),
        )
    except Exception as exc:
        logger.exception("Unexpected error in run %s", ctx.run_id)
        _emit(
            ctx,
            "error",
            {"message": f"Internal error: {type(exc).__name__}", "recoverable": False},
        )
        ctx.status = "error"
        await _safe_update_run(
            db,
            ctx.run_id,
            status="error",
            error=str(exc),
            duration_ms=_elapsed_ms(run_start),
        )
    finally:
        await ctx.queue.put(None)  # sentinel closes SSE streams
        # Grace period before cleanup so reconnecting clients can replay
        grace = int(os.getenv("RUN_CLEANUP_GRACE_SECONDS", "300"))
        if grace > 0:
            await asyncio.sleep(grace)
        run_manager.cleanup_run(ctx.run_id)


async def _stream_graph(
    ctx: RunContext, initial_state: dict, db: Any, run_timeout: int
) -> None:
    """Stream execution, handling interrupts, resume, and timeout."""
    graph, config = ctx.compiled_graph, ctx.config
    input_data: dict | Command = initial_state

    nodes_by_id = {n["id"]: n for n in ctx.schema_dict.get("nodes", [])}
    condition_ids = {
        n["id"]
        for n in ctx.schema_dict.get("nodes", [])
        if n.get("type") == "condition"
    }
    # Build edge lookup: source_id -> list of (target_id, condition_branch)
    edges_by_source: dict[str, list[tuple[str, str | None]]] = {}
    for edge in ctx.schema_dict.get("edges", []):
        edges_by_source.setdefault(edge["source"], []).append(
            (edge["target"], edge.get("condition_branch"))
        )

    while True:  # Loop handles resume cycles
        pending_node_start = time.monotonic()
        deferred_condition_edges: list[tuple[str, list[tuple[str, str | None]]]] = []

        async for update in graph.astream(
            input_data, config=config, stream_mode="updates"
        ):
            if ctx.cancel_event.is_set():
                raise asyncio.CancelledError

            for node_name, node_output in update.items():
                now = time.monotonic()

                # Emit deferred condition edge_traversed
                if deferred_condition_edges:
                    for source_id, _branches in deferred_condition_edges:
                        cond_node = nodes_by_id.get(source_id, {})
                        cond_config = cond_node.get("config", {})
                        branch_map = cond_config.get("branches", {})
                        condition_result = None
                        for bname, target_id in branch_map.items():
                            if target_id == node_name:
                                condition_result = bname
                                break
                        _emit(
                            ctx,
                            "edge_traversed",
                            {
                                "from": source_id,
                                "to": node_name,
                                "condition_result": condition_result,
                            },
                        )
                    deferred_condition_edges = []

                # Emit node_started + node_completed as a pair
                node_type = nodes_by_id.get(node_name, {}).get("type", "unknown")
                _emit(
                    ctx,
                    "node_started",
                    {
                        "node_id": node_name,
                        "node_type": node_type,
                        "timestamp": _utcnow_iso(),
                    },
                )

                duration_ms = int((now - pending_node_start) * 1000)
                state = await graph.aget_state(config)
                state_snapshot = state.values if hasattr(state, "values") else {}

                _emit(
                    ctx,
                    "node_completed",
                    {
                        "node_id": node_name,
                        "output": node_output,
                        "state_snapshot": state_snapshot,
                        "duration_ms": duration_ms,
                    },
                )

                # Emit edge_traversed from schema edges
                outgoing = edges_by_source.get(node_name, [])
                if node_name in condition_ids:
                    deferred_condition_edges.append((node_name, outgoing))
                else:
                    for target_id, _ in outgoing:
                        _emit(
                            ctx,
                            "edge_traversed",
                            {
                                "from": node_name,
                                "to": target_id,
                                "condition_result": None,
                            },
                        )

                pending_node_start = time.monotonic()

                # Cooperative timeout (excludes pause time)
                execution_time = now - ctx.started_at - ctx.total_pause_time
                if execution_time >= run_timeout:
                    timeout_s = int(execution_time)
                    _emit(
                        ctx,
                        "error",
                        {
                            "message": f"Run timed out after {timeout_s}s of execution",
                            "recoverable": False,
                        },
                    )
                    ctx.status = "error"
                    await _safe_update_run(
                        db,
                        ctx.run_id,
                        status="error",
                        error=f"Timeout after {timeout_s}s",
                        duration_ms=_elapsed_ms(ctx.started_at),
                    )
                    return

        # astream exhausted — check for interrupt via aget_state
        state = await graph.aget_state(config)
        has_interrupt = (
            hasattr(state, "tasks")
            and state.tasks
            and any(t.interrupts for t in state.tasks)
        )

        if has_interrupt:
            interrupt_val = state.tasks[0].interrupts[0].value
            _emit(
                ctx,
                "graph_paused",
                {
                    "node_id": interrupt_val.get("node_id", "unknown"),
                    "prompt": interrupt_val.get("prompt", ""),
                    "run_id": ctx.run_id,
                    "input_key": interrupt_val.get("input_key", ""),
                },
            )
            ctx.status = "paused"
            ctx.paused_node_id = interrupt_val.get("node_id")
            ctx.paused_prompt = interrupt_val.get("prompt")
            await _safe_update_run(
                db,
                ctx.run_id,
                status="paused",
                paused_node_id=ctx.paused_node_id,
                paused_prompt=ctx.paused_prompt,
            )

            pause_start = time.monotonic()
            await _wait_for_resume(ctx)
            ctx.total_pause_time += time.monotonic() - pause_start

            input_data = Command(resume=ctx.resume_value)
            ctx.status = "running"
            ctx.paused_node_id = None
            ctx.paused_prompt = None
            await _safe_update_run(
                db,
                ctx.run_id,
                status="running",
                paused_node_id=None,
                paused_prompt=None,
            )
            continue  # re-enter outer while with Command(resume=...)

        # No interrupt — graph completed
        duration_ms = int((time.monotonic() - ctx.started_at) * 1000)
        final_state = state.values if hasattr(state, "values") else {}
        _emit(
            ctx,
            "graph_completed",
            {
                "final_state": final_state,
                "duration_ms": duration_ms,
            },
        )
        ctx.status = "completed"
        await _safe_update_run(
            db,
            ctx.run_id,
            status="completed",
            final_state=final_state,
            duration_ms=duration_ms,
        )
        return


async def _wait_for_resume(ctx: RunContext) -> None:
    """Block until resume_event is set, sending keepalives every 15s."""
    while not ctx.resume_event.is_set():
        try:
            await asyncio.wait_for(ctx.resume_event.wait(), timeout=15.0)
        except TimeoutError:
            _emit_keepalive(ctx)
            continue
    ctx.resume_event.clear()


# ---------------------------------------------------------------------------
# SSE stream generator
# ---------------------------------------------------------------------------


async def stream_run_sse(
    ctx: RunContext, last_event_id: int = 0
) -> AsyncGenerator[str]:
    """Replay buffered events after last_event_id, then stream live.

    Deduplicates: live loop skips events with id <= last_replayed_id.
    """
    last_replayed_id = last_event_id

    # Replay from buffer
    for event_dict in ctx.events:
        eid = event_dict["id"]
        if eid is not None and eid > last_event_id:
            yield format_sse(event_dict["event"], event_dict["data"], event_id=eid)
            last_replayed_id = eid

    # Live stream from queue
    while True:
        event_dict = await ctx.queue.get()
        if event_dict is None:
            break
        eid = event_dict.get("id")
        if eid is not None and eid <= last_replayed_id:
            continue  # already replayed from buffer
        yield format_sse(event_dict["event"], event_dict["data"], event_id=eid)
