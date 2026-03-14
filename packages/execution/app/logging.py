"""Structured JSON logging configuration."""

import json
import logging
import os


class JSONFormatter(logging.Formatter):
    """JSON log formatter with run context fields."""

    def format(self, record: logging.LogRecord) -> str:
        return json.dumps(
            {
                "ts": self.formatTime(record),
                "level": record.levelname,
                "request_id": getattr(record, "request_id", None),
                "run_id": getattr(record, "run_id", None),
                "node_id": getattr(record, "node_id", None),
                "msg": record.getMessage(),
            }
        )


def setup_logging() -> None:
    """Configure structured logging for the application."""
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logging.root.handlers = [handler]
    logging.root.setLevel(level)
