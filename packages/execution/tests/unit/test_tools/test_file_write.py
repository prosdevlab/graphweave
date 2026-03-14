"""File write tool tests."""

from __future__ import annotations

from app.tools.file_read import FileReadTool
from app.tools.file_write import FileWriteTool


def _write(inputs: dict, sandbox: str) -> dict:
    tool = FileWriteTool()
    import app.tools.file_write as mod

    mod._SANDBOX_ROOT = sandbox
    return tool.run(inputs)


def _read(inputs: dict, sandbox: str) -> dict:
    tool = FileReadTool()
    import app.tools.file_read as mod

    mod._SANDBOX_ROOT = sandbox
    return tool.run(inputs)


def test_write_file(tmp_path):
    result = _write({"path": "test.txt", "content": "Hello"}, str(tmp_path))
    assert result["success"] is True
    assert "5 bytes" in result["result"]
    assert (tmp_path / "test.txt").read_text(encoding="utf-8") == "Hello"


def test_append_mode(tmp_path):
    (tmp_path / "log.txt").write_text("line1\n", encoding="utf-8")
    result = _write(
        {"path": "log.txt", "content": "line2\n", "mode": "append"},
        str(tmp_path),
    )
    assert result["success"] is True
    assert (tmp_path / "log.txt").read_text(encoding="utf-8") == "line1\nline2\n"


def test_path_traversal_blocked(tmp_path):
    result = _write(
        {"path": "../../etc/evil", "content": "pwned"},
        str(tmp_path),
    )
    assert result["success"] is False
    assert "escapes" in result["error"].lower() or "sandbox" in result["error"].lower()


def test_creates_parent_dirs(tmp_path):
    result = _write(
        {"path": "a/b/c/deep.txt", "content": "nested"},
        str(tmp_path),
    )
    assert result["success"] is True
    assert (tmp_path / "a" / "b" / "c" / "deep.txt").exists()


def test_content_too_large(tmp_path):
    result = _write(
        {"path": "big.txt", "content": "x" * 1_100_000},
        str(tmp_path),
    )
    assert result["success"] is False
    assert "too large" in result["error"].lower()


def test_symlink_escape(tmp_path):
    """O_NOFOLLOW rejects symlink at the leaf component."""
    outside = tmp_path / "outside"
    outside.mkdir()
    target = outside / "target.txt"
    target.write_text("original", encoding="utf-8")

    link = tmp_path / "sandbox" / "link.txt"
    (tmp_path / "sandbox").mkdir()
    link.symlink_to(target)

    result = _write(
        {"path": "link.txt", "content": "overwritten"},
        str(tmp_path / "sandbox"),
    )
    # O_NOFOLLOW should reject the symlink
    assert result["success"] is False
    # Original file should be untouched
    assert target.read_text(encoding="utf-8") == "original"


def test_symlink_in_parent_directory(tmp_path):
    """Symlink used as parent directory component is caught by realpath check."""
    outside = tmp_path / "outside"
    outside.mkdir()

    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()

    # Create symlink inside sandbox pointing outside
    (sandbox / "escape").symlink_to(outside)

    result = _write(
        {"path": "escape/evil.txt", "content": "pwned"},
        str(sandbox),
    )
    assert result["success"] is False
    # Verify nothing was written outside
    assert not (outside / "evil.txt").exists()


def test_file_roundtrip(tmp_path):
    """Write via file_write, read back via file_read, content matches."""
    sandbox = str(tmp_path)
    content = "Hello, GraphWeave!\nLine 2.\n"
    write_result = _write({"path": "roundtrip.txt", "content": content}, sandbox)
    assert write_result["success"] is True

    read_result = _read({"path": "roundtrip.txt"}, sandbox)
    assert read_result["success"] is True
    assert read_result["result"] == content
