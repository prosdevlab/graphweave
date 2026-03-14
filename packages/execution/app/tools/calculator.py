"""Calculator tool — safe math expression evaluation via simpleeval."""

from __future__ import annotations

import simpleeval
from simpleeval import EvalWithCompoundTypes, FeatureNotAvailable

from app.tools.base import BaseTool

# Override module-level defaults to prevent resource exhaustion.
# safe_power() reads these globals, not instance attributes.
simpleeval.MAX_POWER = 1000
simpleeval.MAX_STRING_LENGTH = 100_000


class CalculatorTool(BaseTool):
    name = "calculator"
    description = "Evaluate mathematical expressions"

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
