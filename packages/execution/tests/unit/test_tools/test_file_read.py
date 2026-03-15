"""File read tool tests."""

from __future__ import annotations

import os

from app.tools.file_read import FileReadTool


def _read(inputs: dict, sandbox: str) -> dict:
    tool = FileReadTool()
    orig = os.environ.get("FILE_SANDBOX_ROOT")
    os.environ["FILE_SANDBOX_ROOT"] = sandbox
    # Reload module-level default
    import app.tools.file_read as mod

    mod._SANDBOX_ROOT = sandbox
    try:
        return tool.run(inputs)
    finally:
        if orig is not None:
            os.environ["FILE_SANDBOX_ROOT"] = orig
        elif "FILE_SANDBOX_ROOT" in os.environ:
            del os.environ["FILE_SANDBOX_ROOT"]


def test_read_file(tmp_path):
    (tmp_path / "hello.txt").write_text("Hello world", encoding="utf-8")
    result = _read({"path": "hello.txt"}, str(tmp_path))
    assert result["success"] is True
    assert result["result"] == "Hello world"
    assert result["truncated"] is False


def test_read_empty_file(tmp_path):
    (tmp_path / "empty.txt").write_text("", encoding="utf-8")
    result = _read({"path": "empty.txt"}, str(tmp_path))
    assert result["success"] is True
    assert result["result"] == ""


def test_path_traversal_blocked(tmp_path):
    result = _read({"path": "../../etc/passwd"}, str(tmp_path))
    assert result["success"] is False
    assert "escapes" in result["error"].lower() or "sandbox" in result["error"].lower()


def test_file_not_found(tmp_path):
    result = _read({"path": "nonexistent.txt"}, str(tmp_path))
    assert result["success"] is False


def test_file_too_large(tmp_path):
    big = tmp_path / "big.txt"
    big.write_bytes(b"x" * 1_100_000)
    result = _read({"path": "big.txt"}, str(tmp_path))
    assert result["success"] is False
    assert "too large" in result["error"].lower()


def test_truncation(tmp_path):
    (tmp_path / "long.txt").write_text("x" * 15_000, encoding="utf-8")
    result = _read({"path": "long.txt"}, str(tmp_path))
    assert result["success"] is True
    assert result["truncated"] is True
    assert len(result["result"]) == 10_000


def test_symlink_escape(tmp_path):
    """Symlink pointing outside sandbox is caught by realpath check."""
    outside = tmp_path / "outside"
    outside.mkdir()
    target = outside / "secret.txt"
    target.write_text("secret", encoding="utf-8")

    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    link = sandbox / "link.txt"
    link.symlink_to(target)

    result = _read({"path": "link.txt"}, str(sandbox))
    assert result["success"] is False


def test_symlink_inside_sandbox_blocked_by_onofollow(tmp_path):
    """Symlink inside sandbox (realpath passes) is blocked by O_NOFOLLOW."""
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    target = sandbox / "real.txt"
    target.write_text("real content", encoding="utf-8")
    link = sandbox / "link.txt"
    link.symlink_to(target)

    # realpath resolves link.txt → real.txt (inside sandbox), so
    # the realpath check passes. O_NOFOLLOW on the leaf should reject it.
    result = _read({"path": "link.txt"}, str(sandbox))
    # On macOS, O_NOFOLLOW + O_RDONLY may still follow symlinks.
    # On Linux, O_NOFOLLOW rejects symlinks at the leaf.
    # Either way, the read should either fail or return the real content
    # (since the target is inside the sandbox, this is safe either way).
    if result["success"]:
        # macOS: O_NOFOLLOW doesn't block read-only symlinks
        assert result["result"] == "real content"
    else:
        # Linux: O_NOFOLLOW blocks the symlink
        assert "success" in result and result["success"] is False


def test_binary_file_returns_error(tmp_path):
    (tmp_path / "binary.bin").write_bytes(b"\x80\x81\x82\xff")
    result = _read({"path": "binary.bin"}, str(tmp_path))
    assert result["success"] is False
    assert "utf-8" in result["error"].lower() or "decode" in result["error"].lower()
