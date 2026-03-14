"""File write tool — sandboxed text file writing."""

from __future__ import annotations

import os

from app.tools.base import BaseTool
from app.tools.sandbox import resolve_sandboxed_path

_MAX_CONTENT_SIZE = 1_000_000  # 1 MB
_SANDBOX_ROOT = os.environ.get("FILE_SANDBOX_ROOT", "/workspace")


class FileWriteTool(BaseTool):
    name = "file_write"
    description = "Write text content to a sandboxed file"

    def run(self, inputs: dict) -> dict:
        path = inputs.get("path", "")
        content = inputs.get("content", "")
        mode = inputs.get("mode", "overwrite")

        if not path:
            return {
                "success": False,
                "error": "No path provided",
                "recoverable": False,
            }

        if len(content) > _MAX_CONTENT_SIZE:
            return {
                "success": False,
                "error": (
                    f"Content too large: {len(content)} bytes (max {_MAX_CONTENT_SIZE})"
                ),
                "recoverable": False,
            }

        resolved = resolve_sandboxed_path(path, _SANDBOX_ROOT)
        if resolved is None:
            return {
                "success": False,
                "error": f"Path escapes sandbox: {path}",
                "recoverable": False,
            }

        # Create parent directories
        parent = os.path.dirname(resolved)
        try:
            os.makedirs(parent, exist_ok=True)
        except OSError as exc:
            return {
                "success": False,
                "error": f"Cannot create directories: {exc}",
                "recoverable": False,
            }

        # Open with O_NOFOLLOW to reject symlinks at the leaf
        flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW
        if mode == "append":
            flags |= os.O_APPEND
        else:
            flags |= os.O_TRUNC

        try:
            fd = os.open(resolved, flags, 0o644)
        except OSError as exc:
            return {
                "success": False,
                "error": f"Cannot open file: {exc}",
                "recoverable": False,
            }

        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(content)
        except UnicodeEncodeError as exc:
            return {
                "success": False,
                "error": f"Encoding error: {exc}",
                "recoverable": False,
            }
        except OSError as exc:
            return {
                "success": False,
                "error": f"Write error: {exc}",
                "recoverable": False,
            }

        byte_count = len(content.encode("utf-8"))
        return {
            "success": True,
            "result": f"Written {byte_count} bytes to {path}",
            "source": path,
            "truncated": False,
        }
