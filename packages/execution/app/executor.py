"""Run management and SSE streaming."""

import json
from collections.abc import AsyncGenerator


def format_sse(event: str, data: dict) -> str:
    """Format a server-sent event string."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_run(
    run_id: str, graph: object, input_data: dict
) -> AsyncGenerator[str]:
    """Stream execution events as SSE.

    Args:
        run_id: Unique run identifier.
        graph: A compiled LangGraph StateGraph.
        input_data: Initial input for the graph.

    Yields:
        SSE-formatted event strings.
    """
    # TODO: Implement streaming execution
    yield format_sse("run_started", {"run_id": run_id, "timestamp": ""})
    yield format_sse("graph_completed", {"final_state": {}, "duration_ms": 0})
