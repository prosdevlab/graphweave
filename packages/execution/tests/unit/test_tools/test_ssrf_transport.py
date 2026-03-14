"""SSRF-safe transport tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpcore
import httpx

from app.tools.ssrf_transport import PinnedDNSBackend, SSRFSafeTransport


def test_backend_connect_tcp_receives_pinned_ip():
    """PinnedDNSBackend passes pinned IP to underlying backend, not hostname."""
    backend = PinnedDNSBackend("93.184.216.34")

    with patch.object(backend, "_backend") as mock_backend:
        mock_backend.connect_tcp.return_value = MagicMock()
        backend.connect_tcp("example.com", 443)

    mock_backend.connect_tcp.assert_called_once()
    call_args = mock_backend.connect_tcp.call_args
    assert call_args[0][0] == "93.184.216.34"
    assert call_args[0][1] == 443


def test_transport_end_to_end_with_httpx_client():
    """SSRFSafeTransport works through a real httpx.Client request cycle."""
    transport = SSRFSafeTransport("127.0.0.1")

    # Mock at the pool level to avoid actual network calls
    mock_response = httpcore.Response(
        status=200,
        headers=[(b"content-type", b"text/plain")],
        content=b"OK",
    )
    with patch.object(transport._pool, "handle_request", return_value=mock_response):
        client = httpx.Client(transport=transport)
        resp = client.get("http://example.com/test")

    assert isinstance(resp, httpx.Response)
    assert resp.status_code == 200
    assert resp.text == "OK"
    client.close()


def test_transport_preserves_ssl_context():
    """SSL context from HTTPTransport.__init__ is forwarded to replacement pool."""
    transport = SSRFSafeTransport("93.184.216.34", verify=False)
    assert transport._pool._ssl_context is not None
    # verify=False produces a context that does not check hostnames
    assert transport._pool._ssl_context.check_hostname is False


def test_transport_default_ssl_context():
    """Default transport (verify=True) has a verifying ssl_context."""
    transport = SSRFSafeTransport("93.184.216.34")
    assert transport._pool._ssl_context is not None
    assert transport._pool._ssl_context.check_hostname is True


def test_backend_forwards_timeout():
    """PinnedDNSBackend passes through timeout and other kwargs."""
    backend = PinnedDNSBackend("10.0.0.1")

    with patch.object(backend, "_backend") as mock_backend:
        mock_backend.connect_tcp.return_value = MagicMock()
        backend.connect_tcp("example.com", 80, timeout=5.0, local_address="0.0.0.0")

    call_kwargs = mock_backend.connect_tcp.call_args
    assert call_kwargs[1]["timeout"] == 5.0
    assert call_kwargs[1]["local_address"] == "0.0.0.0"


def test_transport_uses_pinned_dns_backend():
    """The transport's pool uses PinnedDNSBackend as its network backend."""
    transport = SSRFSafeTransport("1.2.3.4")
    pool = transport._pool
    assert isinstance(pool._network_backend, PinnedDNSBackend)
    assert pool._network_backend._pinned_ip == "1.2.3.4"


def test_transport_close():
    """Transport close delegates to pool."""
    transport = SSRFSafeTransport("1.2.3.4")
    with patch.object(transport._pool, "close") as mock_close:
        transport.close()
    mock_close.assert_called_once()
