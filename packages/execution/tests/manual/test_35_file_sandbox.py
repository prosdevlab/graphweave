"""Manual test 35: File read/write sandbox — real filesystem operations.

Usage: cd packages/execution && uv run python tests/manual/test_35_file_sandbox.py
"""

import os
import tempfile

from app.tools.file_read import FileReadTool
from app.tools.file_write import FileWriteTool


def main():
    print("── Test 35: File sandbox real filesystem ──")

    with tempfile.TemporaryDirectory() as sandbox:
        # Patch sandbox root
        import app.tools.file_read as fr_mod
        import app.tools.file_write as fw_mod

        fr_mod._SANDBOX_ROOT = sandbox
        fw_mod._SANDBOX_ROOT = sandbox

        writer = FileWriteTool()
        reader = FileReadTool()

        # 1. Write and read back
        result = writer.run({"path": "hello.txt", "content": "Hello, GraphWeave!"})
        assert result["success"] is True, f"Write failed: {result}"
        print(f"  ✓ Write: {result['result']}")

        result = reader.run({"path": "hello.txt"})
        assert result["success"] is True
        assert result["result"] == "Hello, GraphWeave!"
        print(f"  ✓ Read back: {result['result']}")

        # 2. Nested directory creation
        result = writer.run(
            {
                "path": "deep/nested/dir/file.txt",
                "content": "deep content",
            }
        )
        assert result["success"] is True
        assert os.path.exists(os.path.join(sandbox, "deep/nested/dir/file.txt"))
        print("  ✓ Nested dirs created")

        # 3. Append mode
        writer.run({"path": "log.txt", "content": "line1\n"})
        writer.run({"path": "log.txt", "content": "line2\n", "mode": "append"})
        result = reader.run({"path": "log.txt"})
        assert result["result"] == "line1\nline2\n"
        print("  ✓ Append mode works")

        # 4. Path traversal blocked
        result = reader.run({"path": "../../etc/passwd"})
        assert result["success"] is False
        print(f"  ✓ Traversal blocked: {result['error']}")

        result = writer.run({"path": "../../../tmp/evil", "content": "pwned"})
        assert result["success"] is False
        print(f"  ✓ Write traversal blocked: {result['error']}")

        # 5. Symlink escape
        outside = os.path.join(sandbox, "..", "outside_file.txt")
        with open(outside, "w") as f:
            f.write("outside")
        link_path = os.path.join(sandbox, "escape_link.txt")
        os.symlink(outside, link_path)

        result = reader.run({"path": "escape_link.txt"})
        assert result["success"] is False
        print("  ✓ Symlink escape blocked (read)")

        result = writer.run({"path": "escape_link.txt", "content": "overwrite"})
        assert result["success"] is False
        # Verify original file untouched
        with open(outside) as f:
            assert f.read() == "outside"
        print("  ✓ Symlink escape blocked (write)")

        # Cleanup outside file
        os.unlink(outside)

    print("\n✅ All file sandbox tests passed")


if __name__ == "__main__":
    main()
