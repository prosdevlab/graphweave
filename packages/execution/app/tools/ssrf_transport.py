"""SSRF-safe httpx transport — pins DNS resolution to prevent rebinding."""

from __future__ import annotations

import httpcore
import httpx
from httpcore._backends.sync import SyncBackend


class PinnedDNSBackend(httpcore.NetworkBackend):
    """Network backend that substitutes hostname with a pinned IP in connect_tcp.

    Wraps the default SyncBackend.  When ``connect_tcp`` is called, replaces
    the ``host`` parameter with the pinned IP while leaving everything else
    unchanged.  This means:

    - TCP connection goes to the pinned IP (SSRF-safe)
    - TLS SNI uses the original hostname (httpcore passes it separately)
    - Host header uses the original hostname (httpx sets it from the URL)
    """

    def __init__(self, pinned_ip: str) -> None:
        self._pinned_ip = pinned_ip
        self._backend = SyncBackend()

    def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: object = None,
    ) -> httpcore.NetworkStream:
        return self._backend.connect_tcp(
            self._pinned_ip,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


class SSRFSafeTransport(httpx.HTTPTransport):
    """httpx transport that pins DNS to a pre-validated IP.

    Subclasses ``HTTPTransport`` to inherit its ``handle_request`` method,
    which correctly converts between ``httpx.Request``/``Response`` and
    ``httpcore`` types.  We only replace the internal connection pool with
    one using ``PinnedDNSBackend``.
    """

    def __init__(self, pinned_ip: str, **kwargs: object) -> None:
        super().__init__(**kwargs)
        # Preserve ssl_context from the pool created by super().__init__
        # (respects verify=, cert=, trust_env= kwargs).  Then replace
        # the pool with one using our pinned DNS backend.
        existing_pool = self._pool
        self._pool = httpcore.ConnectionPool(
            ssl_context=existing_pool._ssl_context,
            network_backend=PinnedDNSBackend(pinned_ip),
        )
