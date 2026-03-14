"""Manual test 14: Condition routing with SSE edge_traversed events.

start → condition(field_equals) → branch_a or branch_b → end

Verifies:
  1. edge_traversed emitted for condition edges
  2. condition_result shows which branch was taken
  3. Deferred emission works (condition edge emitted when next node starts)

Usage: cd packages/execution && uv run python tests/manual/test_14_condition_sse.py
"""

import asyncio

from langchain_core.language_models import FakeListChatModel
from langgraph.checkpoint.memory import InMemorySaver

from app.builder import build_graph
from app.executor import RunManager, stream_run_sse


def make_schema():
    return {
        "id": "cond-sse",
        "name": "Condition SSE Test",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "mode", "type": "string", "reducer": "replace"},
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
                "id": "route",
                "type": "condition",
                "label": "Route",
                "position": {"x": 0, "y": 100},
                "config": {
                    "condition": {
                        "type": "field_equals",
                        "field": "mode",
                        "value": "creative",
                        "branch": "creative_path",
                    },
                    "branches": {
                        "creative_path": "llm_creative",
                        "factual_path": "llm_factual",
                    },
                    "default_branch": "factual_path",
                },
            },
            {
                "id": "llm_creative",
                "type": "llm",
                "label": "Creative LLM",
                "position": {"x": -100, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Be creative.",
                    "temperature": 1.0,
                    "max_tokens": 50,
                    "input_map": {"q": "messages[-1].content"},
                    "output_key": "result",
                },
            },
            {
                "id": "llm_factual",
                "type": "llm",
                "label": "Factual LLM",
                "position": {"x": 100, "y": 200},
                "config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "system_prompt": "Be factual.",
                    "temperature": 0,
                    "max_tokens": 50,
                    "input_map": {"q": "messages[-1].content"},
                    "output_key": "result",
                },
            },
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 300},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "route"},
            {
                "id": "e2",
                "source": "route",
                "target": "llm_creative",
                "condition_branch": "creative_path",
            },
            {
                "id": "e3",
                "source": "route",
                "target": "llm_factual",
                "condition_branch": "factual_path",
            },
            {"id": "e4", "source": "llm_creative", "target": "e"},
            {"id": "e5", "source": "llm_factual", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


class FakeDB:
    async def execute(self, *args, **kwargs):
        pass

    async def commit(self):
        pass


async def run_with_mode(mode: str, mock_response: str):
    """Run the graph with a given mode and return collected events."""
    schema = make_schema()
    mock = FakeListChatModel(responses=[mock_response])
    saver = InMemorySaver()
    result = build_graph(schema, llm_override=mock, checkpointer=saver)

    run_manager = RunManager()
    run_id = f"test-cond-{mode}"

    ctx = await run_manager.start_run(
        run_id=run_id,
        graph_id="graph-14",
        owner_id="owner-1",
        compiled_graph=result.graph,
        config={"configurable": {"thread_id": run_id}},
        input_data={"messages": [("human", "Tell me about space")], "mode": mode},
        defaults=result.defaults,
        schema_dict=schema,
        db=FakeDB(),
    )

    async for _ in stream_run_sse(ctx):
        pass

    return ctx


async def main():
    print("Test 14: Condition routing with SSE edge_traversed")
    print("-" * 50)

    # Path A: creative mode
    print("\n  Path A: mode='creative'")
    ctx_a = await run_with_mode("creative", "A poem about stars...")
    edge_events_a = [e for e in ctx_a.events if e["event"] == "edge_traversed"]
    print(f"  edge_traversed events: {len(edge_events_a)}")
    for evt in edge_events_a:
        d = evt["data"]
        cr = d["condition_result"]
        print(f"    {d['from']} → {d['to']}  ({cr})")

    # Find the condition edge
    cond_edge_a = [e for e in edge_events_a if e["data"]["from"] == "route"]
    assert len(cond_edge_a) == 1
    assert cond_edge_a[0]["data"]["to"] == "llm_creative", (
        f"Expected creative path, got {cond_edge_a[0]['data']['to']}"
    )
    assert cond_edge_a[0]["data"]["condition_result"] == "creative_path", (
        f"Expected 'creative_path', got {cond_edge_a[0]['data']['condition_result']}"
    )

    # Path B: factual mode (default branch)
    print("\n  Path B: mode='factual' (default branch)")
    ctx_b = await run_with_mode("factual", "Space is vast.")
    edge_events_b = [e for e in ctx_b.events if e["event"] == "edge_traversed"]
    print(f"  edge_traversed events: {len(edge_events_b)}")
    for evt in edge_events_b:
        d = evt["data"]
        cr = d["condition_result"]
        print(f"    {d['from']} → {d['to']}  ({cr})")

    cond_edge_b = [e for e in edge_events_b if e["data"]["from"] == "route"]
    assert len(cond_edge_b) == 1
    assert cond_edge_b[0]["data"]["to"] == "llm_factual", (
        f"Expected factual path, got {cond_edge_b[0]['data']['to']}"
    )
    assert cond_edge_b[0]["data"]["condition_result"] == "factual_path", (
        f"Expected 'factual_path', got {cond_edge_b[0]['data']['condition_result']}"
    )

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
