"""Manual test 6: Full pipeline — tool + real Gemini LLM + condition.

start → calculator → condition(tool_error) →
  success: llm explains the result → end
  error:   llm explains the error → end

Uses real Gemini API. Requires GEMINI_API_KEY in .env.

Usage: cd packages/execution && uv run python scripts/test_06_real_pipeline.py
"""

import asyncio
import os

from dotenv import load_dotenv

from app.builder import build_graph

load_dotenv()


def make_schema():
    return {
        "id": "pipeline",
        "name": "Full Pipeline",
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
                "label": "Check Result",
                "position": {"x": 0, "y": 200},
                "config": {
                    "condition": {
                        "type": "tool_error",
                        "on_error": "explain_err",
                        "on_success": "explain_ok",
                    },
                    "branches": {
                        "explain_err": "llm_err",
                        "explain_ok": "llm_ok",
                    },
                    "default_branch": "explain_ok",
                },
            },
            {
                "id": "llm_ok",
                "type": "llm",
                "label": "Explain Result",
                "position": {"x": 100, "y": 300},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": (
                        "The user asked a math question and the "
                        "calculator gave a result. "
                        "Explain what was calculated in one sentence."
                    ),
                    "temperature": 0,
                    "max_tokens": 100,
                    "input_map": {
                        "expression": "expr",
                        "calculator_result": "calc_out",
                    },
                    "output_key": "result",
                },
            },
            {
                "id": "llm_err",
                "type": "llm",
                "label": "Explain Error",
                "position": {"x": -100, "y": 300},
                "config": {
                    "provider": "gemini",
                    "model": "gemini-2.0-flash",
                    "system_prompt": (
                        "The calculator returned an error. "
                        "Explain the error to the user in one sentence."
                    ),
                    "temperature": 0,
                    "max_tokens": 100,
                    "input_map": {
                        "expression": "expr",
                        "error": "calc_out",
                    },
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
                "target": "llm_ok",
                "condition_branch": "explain_ok",
            },
            {
                "id": "e4",
                "source": "check",
                "target": "llm_err",
                "condition_branch": "explain_err",
            },
            {"id": "e5", "source": "llm_ok", "target": "e"},
            {"id": "e6", "source": "llm_err", "target": "e"},
        ],
        "metadata": {"created_at": "2026-01-01", "updated_at": "2026-01-01"},
    }


async def main():
    print("Test 06: Full pipeline — calculator + Gemini + condition routing")
    print("-" * 60)

    if not os.getenv("GEMINI_API_KEY") and not os.getenv("GOOGLE_API_KEY"):
        print("  SKIP: No GEMINI_API_KEY or GOOGLE_API_KEY in .env")
        return

    schema = make_schema()

    # Success path
    expr = "(2 + 3) * 4 - 1"
    print(f"\n  Expression: {expr}")
    result = build_graph(schema)
    state = await result.graph.ainvoke({**result.defaults, "expr": expr})
    print(f"  Calculator: {state['calc_out']}")
    print(f"  LLM says:   {state['result']}")

    # Error path
    expr2 = "1 / 0"
    print(f"\n  Expression: {expr2}")
    result2 = build_graph(schema)
    state2 = await result2.graph.ainvoke({**result2.defaults, "expr": expr2})
    print(f"  Calculator: {state2['calc_out']}")
    print(f"  LLM says:   {state2['result']}")

    print("\n  PASS")


if __name__ == "__main__":
    asyncio.run(main())
