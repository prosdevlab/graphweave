"""Manual test 30: url_fetch with real HTTPS — verifies SSRFSafeTransport end-to-end.

Tests that DNS pinning works with real TLS/SNI against a public URL.

Usage: cd packages/execution && uv run python tests/manual/test_30_url_fetch_real.py
"""

from app.tools.url_fetch import UrlFetchTool, validate_url


def main():
    print("── Test 30: url_fetch with real HTTPS ──")

    # 1. validate_url returns resolved IP for public URL
    error, ip = validate_url("https://httpbin.org/get")
    assert error is None, f"validate_url failed: {error}"
    assert ip is not None, "No resolved IP returned"
    print(f"  ✓ Resolved httpbin.org → {ip}")

    # 2. Full fetch through SSRFSafeTransport
    tool = UrlFetchTool()
    result = tool.run({"url": "https://httpbin.org/html"})
    assert result["success"] is True, f"Fetch failed: {result.get('error')}"
    assert len(result["result"]) > 0, "Empty result"
    print(f"  ✓ Fetched {len(result['result'])} chars via pinned transport")

    # 3. SSRF: localhost blocked
    error, ip = validate_url("http://127.0.0.1/secret")
    assert error is not None, "localhost should be blocked"
    assert ip is None
    print(f"  ✓ Localhost blocked: {error}")

    # 4. SSRF: metadata endpoint blocked
    error, ip = validate_url("http://169.254.169.254/latest/meta-data/")
    assert error is not None, "metadata IP should be blocked"
    print(f"  ✓ Metadata IP blocked: {error}")

    # 5. Bad scheme rejected
    result = tool.run({"url": "ftp://example.com"})
    assert result["success"] is False
    assert result["recoverable"] is False
    print("  ✓ FTP scheme rejected")

    print("\n✅ All url_fetch real tests passed")


if __name__ == "__main__":
    main()
