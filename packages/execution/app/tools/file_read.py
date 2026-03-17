"""File read tool — sandboxed text file reading."""

from __future__ import annotations

import os

from app.tools.base import BaseTool, ToolParameter
from app.tools.sandbox import open_sandboxed

_MAX_FILE_SIZE = 1_000_000  # 1 MB
_MAX_TEXT_LENGTH = 10_000
_SANDBOX_ROOT = os.environ.get("FILE_SANDBOX_ROOT", "/workspace")


class FileReadTool(BaseTool):
    name = "file_read"
    description = "Read text content from a sandboxed file"
    parameters = [
        ToolParameter(
            name="path",
            type="string",
            required=True,
            description="File path within sandbox",
            examples=["data/input.txt"],
        ),
    ]

    def run(self, inputs: dict) -> dict:
        path = inputs.get("path", "")
        if not path:
            return {
                "success": False,
                "error": "No path provided",
                "recoverable": False,
            }

        try:
            fd = open_sandboxed(path, _SANDBOX_ROOT, os.O_RDONLY)
        except PermissionError as exc:
            return {
                "success": False,
                "error": str(exc),
                "recoverable": False,
            }
        except OSError as exc:
            return {
                "success": False,
                "error": f"Cannot open file: {exc}",
                "recoverable": False,
            }

        try:
            size = os.fstat(fd).st_size
            if size > _MAX_FILE_SIZE:
                return {
                    "success": False,
                    "error": (f"File too large: {size} bytes (max {_MAX_FILE_SIZE})"),
                    "recoverable": False,
                }

            # fdopen takes ownership of fd — closes it on exit
            with os.fdopen(fd, "r", encoding="utf-8") as f:
                fd = -1  # prevent double-close in finally
                text = f.read()
        except UnicodeDecodeError as exc:
            return {
                "success": False,
                "error": f"Not a UTF-8 text file: {exc}",
                "recoverable": False,
            }
        except OSError as exc:
            return {
                "success": False,
                "error": f"Read error: {exc}",
                "recoverable": False,
            }
        finally:
            if fd >= 0:
                os.close(fd)

        truncated = len(text) > _MAX_TEXT_LENGTH
        if truncated:
            text = text[:_MAX_TEXT_LENGTH]

        return {
            "success": True,
            "result": text,
            "source": path,
            "truncated": truncated,
        }
