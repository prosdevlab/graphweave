"""Manual test 2: Linear graph with a real Gemini LLM call.

Requires GEMINI_API_KEY in .env.

Usage: cd packages/execution && uv run python scripts/test_02_real_llm.py
"""

import asyncio
import os

from dotenv import load_dotenv

from app.builder import build_graph

load_dotenv()


def make_schema():
    return {
        "id": "real-llm",
        "name": "Real LLM",
        "version": 1,
        "state": [
            {"key": "messages", "type": "list", "reducer": "append"},
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
                "id": "llm_1",
                "type": "llm",
                "label": "Gemini",
                "position": {"x": 0, "y": 100},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": "Answer in exactly one word. No punctuation.",
                    "temperature": 0,
                    "max_tokens": 10,
                    "input_map": {"question": "messages[-1].content"},
                    "output_key": "result",
                },
            },
            {
                "id": "e",
                "type": "end",
                "label": "End",
                "position": {"x": 0, "y": 200},
                "config": {},
            },
        ],
        "edges": [
            {"id": "e1", "source": "s", "target": "llm_1"},
            {"id": "e2", "source": "llm_1", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def main():
    print("Test 02: Real Gemini LLM call")
    print("-" * 50)

    if not os.getenv("GEMINI_API_KEY") and not os.getenv("GOOGLE_API_KEY"):
        print("  SKIP: No GEMINI_API_KEY or GOOGLE_API_KEY in .env")
        return

    schema = make_schema()
    result = build_graph(schema)

    question = "What is the capital of France?"
    print(f"  Question: {question}")

    state = await result.graph.ainvoke(
        {**result.defaults, "messages": [("human", question)]}
    )

    print(f"  Answer:   {state['result']}")
    assert len(state["result"]) > 0, "Got empty response"
    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
