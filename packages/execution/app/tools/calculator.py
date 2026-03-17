"""Calculator tool — safe math expression evaluation via simpleeval."""

from __future__ import annotations

import simpleeval
from simpleeval import EvalWithCompoundTypes, FeatureNotAvailable

from app.tools.base import BaseTool, ToolParameter

# Override module-level defaults to prevent resource exhaustion.
# safe_power() reads these globals, not instance attributes.
simpleeval.MAX_POWER = 1000
simpleeval.MAX_STRING_LENGTH = 100_000


class CalculatorTool(BaseTool):
    name = "calculator"
    description = "Evaluate mathematical expressions"
    parameters = [
        ToolParameter(
            name="expression",
            type="string",
            required=True,
            description="Math expression to evaluate",
            examples=["2 + 2", "sqrt(144)", "3.14 * 5**2"],
        ),
    ]

    def run(self, inputs: dict) -> dict:
        expression = inputs.get("expression", "")
        evaluator = EvalWithCompoundTypes()
        try:
            result = evaluator.eval(expression)
            return {
                "success": True,
                "result": str(result),
                "source": "simpleeval",
                "truncated": False,
            }
        except ZeroDivisionError as exc:
            return {"success": False, "error": str(exc), "recoverable": True}
        except (SyntaxError, FeatureNotAvailable, TypeError, ValueError) as exc:
            return {"success": False, "error": str(exc), "recoverable": True}
        except Exception as exc:
            return {"success": False, "error": str(exc), "recoverable": True}
