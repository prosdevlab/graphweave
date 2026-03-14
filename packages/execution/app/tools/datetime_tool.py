"""Datetime tool — current time, format, and parse dates."""

from __future__ import annotations

from datetime import UTC, datetime

from app.tools.base import BaseTool


class DatetimeTool(BaseTool):
    name = "datetime"
    description = "Get current time, format, or parse dates"

    def run(self, inputs: dict) -> dict:
        action = inputs.get("action", "")

        if action == "now":
            return {
                "success": True,
                "result": datetime.now(UTC).isoformat(),
                "source": "datetime",
                "truncated": False,
            }

        if action == "format":
            try:
                dt = datetime.fromisoformat(inputs["date"])
                return {
                    "success": True,
                    "result": dt.strftime(inputs["fmt"]),
                    "source": "datetime",
                    "truncated": False,
                }
            except (KeyError, ValueError) as exc:
                return {"success": False, "error": str(exc), "recoverable": True}

        if action == "parse":
            try:
                dt = datetime.fromisoformat(inputs["date"])
                return {
                    "success": True,
                    "result": dt.isoformat(),
                    "source": "datetime",
                    "truncated": False,
                }
            except (KeyError, ValueError) as exc:
                return {"success": False, "error": str(exc), "recoverable": True}

        return {
            "success": False,
            "error": f"Unknown action: {action}",
            "recoverable": False,
        }
