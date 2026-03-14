"""Manual test 3: Branching graph with condition routing.

start → condition(field_equals) → branch_a (Gemini) or branch_b (mock) → end

Tests both paths. First run uses real Gemini, second uses FakeListChatModel.

Usage: cd packages/execution && uv run python tests/manual/test_03_branching.py
"""

import asyncio
import os

from dotenv import load_dotenv
from langchain_core.language_models import FakeListChatModel

from app.builder import build_graph

load_dotenv()


def make_schema():
    return {
        "id": "branch",
        "name": "Branching",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
            {"key": "result", "type": "string", "reducer": "replace"},
            {"key": "mode", "type": "string", "reducer": "replace"},
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
                "id": "cond_1",
                "type": "condition",
                "label": "Check Mode",
                "position": {"x": 0, "y": 100},
                "config": {
                    "condition": {
                        "type": "field_equals",
                        "field": "mode",
                        "value": "creative",
                        "branch": "creative",
                    },
                    "branches": {"creative": "llm_creative", "factual": "llm_factual"},
                    "default_branch": "factual",
                },
            },
            {
                "id": "llm_creative",
                "type": "llm",
                "label": "Creative LLM",
                "position": {"x": -100, "y": 200},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": "Be wildly creative. One sentence max.",
                    "temperature": 1.0,
                    "max_tokens": 50,
                    "input_map": {"prompt": "messages[-1].content"},
                    "output_key": "result",
                },
            },
            {
                "id": "llm_factual",
                "type": "llm",
                "label": "Factual LLM",
                "position": {"x": 100, "y": 200},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": "Be precise and factual. One sentence max.",
                    "temperature": 0,
                    "max_tokens": 50,
                    "input_map": {"prompt": "messages[-1].content"},
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
            {"id": "e1", "source": "s", "target": "cond_1"},
            {
                "id": "e2",
                "source": "cond_1",
                "target": "llm_creative",
                "condition_branch": "creative",
            },
            {
                "id": "e3",
                "source": "cond_1",
                "target": "llm_factual",
                "condition_branch": "factual",
            },
            {"id": "e4", "source": "llm_creative", "target": "e"},
            {"id": "e5", "source": "llm_factual", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def main():
    print("Test 03: Branching graph with condition routing")
    print("-" * 50)

    has_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

    schema = make_schema()
    question = "Tell me about the moon"

    if has_key:
        # Path A: creative
        print("\n  Path A: mode='creative' (real Gemini, temperature=1.0)")
        result = build_graph(schema)
        state = await result.graph.ainvoke(
            {**result.defaults, "mode": "creative", "messages": [("human", question)]}
        )
        print(f"  Result: {state['result']}")

        # Path B: factual (default)
        print("\n  Path B: mode='factual' (real Gemini, temperature=0)")
        result = build_graph(schema)
        state = await result.graph.ainvoke(
            {**result.defaults, "mode": "factual", "messages": [("human", question)]}
        )
        print(f"  Result: {state['result']}")
    else:
        print("  No Gemini key — using FakeListChatModel")
        mock = FakeListChatModel(responses=["Creative moon story!"])
        result = build_graph(schema, llm_override=mock)
        state = await result.graph.ainvoke(
            {**result.defaults, "mode": "creative", "messages": [("human", question)]}
        )
        print(f"  Path A (creative): {state['result']}")

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
