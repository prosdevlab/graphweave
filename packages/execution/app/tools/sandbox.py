"""File sandbox — path traversal prevention for file_read/file_write."""

from __future__ import annotations

import os


def resolve_sandboxed_path(path: str, sandbox_root: str) -> str | None:
    """Resolve *path* within *sandbox_root*.

    Returns the absolute resolved path, or ``None`` if the path escapes
    the sandbox (via ``../``, symlinks, etc.).

    ``os.path.realpath()`` resolves symlinks in parent directories.
    ``O_NOFOLLOW`` on the subsequent open guards the leaf component.
    """
    abs_root = os.path.realpath(sandbox_root)
    candidate = os.path.realpath(os.path.join(abs_root, path))
    if not candidate.startswith(abs_root + os.sep) and candidate != abs_root:
        return None
    return candidate


def open_sandboxed(
    path: str,
    sandbox_root: str,
    flags: int,
    mode: int = 0o644,
) -> int:
    """Open a file within the sandbox with ``O_NOFOLLOW``.

    Validates the path first via :func:`resolve_sandboxed_path`, then
    opens with ``O_NOFOLLOW`` to reject symlinks at the final component.

    Returns:
        Raw file descriptor (caller must close or wrap with ``os.fdopen``).

    Raises:
        PermissionError: If the path escapes the sandbox.
        OSError: If the file cannot be opened (e.g. symlink at leaf).
    """
    resolved = resolve_sandboxed_path(path, sandbox_root)
    if resolved is None:
        raise PermissionError(f"Path escapes sandbox: {path}")
    return os.open(resolved, flags | os.O_NOFOLLOW, mode)
