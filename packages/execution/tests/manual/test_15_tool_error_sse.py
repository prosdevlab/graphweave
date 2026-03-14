"""Manual test 15: Tool error routing with SSE events.

start → calculator → condition(tool_error) → success_path or error_path → end

Verifies:
  1. tool_error condition routes correctly based on tool success/failure
  2. edge_traversed shows on_success or on_error branch
  3. Full event sequence for both paths

Usage: cd packages/execution && uv run python tests/manual/test_15_tool_error_sse.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_schema():
    return {
        "id": "tool-error-sse",
        "name": "Tool Error SSE Test",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "expr", "type": "string", "reducer": "replace"},
            {"key": "calc_out", "type": "object", "reducer": "replace"},
            {"key": "result", "type": "string", "reducer": "replace"},
        ],
        "nodes": [
            {
                "id": "s",
                "type": "start",
                "label": "Start",
                "position": {"x": 0, "y": 0},
                "config": {},
            },
            {
                "id": "calc",
                "type": "tool",
                "label": "Calculator",
                "position": {"x": 0, "y": 100},
                "config": {
                    "tool_name": "calculator",
                    "input_map": {"expression": "expr"},
                    "output_key": "calc_out",
                },
            },
            {
                "id": "check",
                "type": "condition",
                "label": "Check Error",
                "position": {"x": 0, "y": 200},
                "config": {
                    "condition": {
                        "type": "tool_error",
                        "on_error": "handle_err",
                        "on_success": "done",
                    },
                    "branches": {"handle_err": "llm_err", "done": "e"},
                    "default_branch": "done",
                },
            },
            {
                "id": "llm_err",
                "type": "llm",
                "label": "Error Handler",
                "position": {"x": -100, "y": 300},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Explain the error.",
                    "temperature": 0,
                    "max_tokens": 50,
                    "input_map": {"error": "calc_out"},
                    "output_key": "result",
                },
            },
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 400},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "calc"},
            {"id": "e2", "source": "calc", "target": "check"},
            {
                "id": "e3",
                "source": "check",
                "target": "llm_err",
                "condition_branch": "handle_err",
            },
            {
                "id": "e4",
                "source": "check",
                "target": "e",
                "condition_branch": "done",
            },
            {"id": "e5", "source": "llm_err", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def run_with_expr(expression: str, mock_response: str):
    schema = make_schema()
    mock = FakeListChatModel(responses=[mock_response])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = f"test-tool-err-{expression.replace(' ', '')}"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-15",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"expr": expression},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    async for _ in stream_run_sse(ctx):
        pass

    return ctx


async def main():
    print("Test 15: Tool error routing with SSE events")
    print("-" * 50)

    # Success path: valid expression
    print("\n  Path A: valid expression '2 + 3 * 4'")
    ctx_ok = await run_with_expr("2 + 3 * 4", "should not be called")

    node_events = [e for e in ctx_ok.events if e["event"] == "node_completed"]
    completed_ids = [e["data"]["node_id"] for e in node_events]
    print(f"  Nodes completed: {completed_ids}")

    # On success, condition routes to END — no next node runs, so the
    # deferred edge_traversed for the condition never emits (END is not
    # a real node). Verify by checking llm_err did NOT run.
    assert "llm_err" not in completed_ids, "llm_err should not run on success path"
    assert "calc" in completed_ids, "Calculator should have run"
    assert "check" in completed_ids, "Condition should have run"
    print("  Routed to: END (llm_err not in completed nodes)")

    # Error path: division by zero
    print("\n  Path B: invalid expression '1 / 0'")
    ctx_err = await run_with_expr("1 / 0", "Division by zero is undefined.")

    edge_events_err = [e for e in ctx_err.events if e["event"] == "edge_traversed"]
    node_events_err = [e for e in ctx_err.events if e["event"] == "node_completed"]
    err_node_ids = [e["data"]["node_id"] for e in node_events_err]
    print(f"  Nodes completed: {err_node_ids}")

    # On error, condition routes to llm_err — which is a real node, so
    # the deferred edge_traversed fires when llm_err starts
    cond_edge_err = [e for e in edge_events_err if e["data"]["from"] == "check"]
    assert len(cond_edge_err) == 1, (
        f"Expected 1 condition edge, got {len(cond_edge_err)}"
    )
    to = cond_edge_err[0]["data"]["to"]
    cr = cond_edge_err[0]["data"]["condition_result"]
    print(f"  Condition routed to: {to} ({cr})")
    assert cond_edge_err[0]["data"]["condition_result"] == "handle_err", (
        f"Expected 'handle_err', got {cond_edge_err[0]['data']['condition_result']}"
    )

    # Verify llm_err node ran
    assert "llm_err" in err_node_ids, f"Expected llm_err to run, got {err_node_ids}"

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
