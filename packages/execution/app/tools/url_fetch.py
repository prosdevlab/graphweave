"""URL fetch tool — fetch and extract text content from a URL."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
import trafilatura

from app.tools.base import BaseTool
from app.tools.ssrf_transport import SSRFSafeTransport

_MAX_TEXT_LENGTH = 10_000


def validate_url(url: str) -> tuple[str | None, str | None]:
    """Validate a URL for SSRF safety.

    Returns:
        (error, resolved_ip) — error is set if URL is unsafe,
        resolved_ip is the first safe IP address for DNS-pinning.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return (f"Invalid URL: {url}", None)

    if parsed.scheme not in ("http", "https"):
        return (
            f"Only http/https URLs are allowed, got: {parsed.scheme or 'none'}",
            None,
        )

    hostname = parsed.hostname
    if not hostname:
        return ("URL has no hostname", None)

    try:
        addr_infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return (f"Cannot resolve hostname: {hostname}", None)

    resolved_ip = None
    for info in addr_infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_reserved or ip.is_loopback or ip.is_link_local:
            return (
                f"Blocked: {hostname} resolves to private/reserved IP {ip}",
                None,
            )
        if resolved_ip is None:
            resolved_ip = str(ip)

    if resolved_ip is None:
        return (f"No usable IP addresses for hostname: {hostname}", None)

    return (None, resolved_ip)


class UrlFetchTool(BaseTool):
    name = "url_fetch"
    description = "Fetch and extract text content from a URL"

    def run(self, inputs: dict) -> dict:
        url = inputs.get("url", "")

        error, resolved_ip = validate_url(url)
        if error:
            return {"success": False, "error": error, "recoverable": False}

        try:
            transport = SSRFSafeTransport(resolved_ip)
            with httpx.Client(
                transport=transport, timeout=10, follow_redirects=False
            ) as client:
                response = client.get(url)
                response.raise_for_status()
        except httpx.TimeoutException:
            return {
                "success": False,
                "error": f"Request timed out: {url}",
                "recoverable": True,
            }
        except httpx.HTTPError as exc:
            return {
                "success": False,
                "error": f"HTTP error: {exc}",
                "recoverable": True,
            }

        text = trafilatura.extract(response.text) or ""

        if not text:
            return {
                "success": True,
                "result": "",
                "source": url,
                "truncated": False,
                "warning": "No extractable text content",
            }

        truncated = len(text) > _MAX_TEXT_LENGTH
        if truncated:
            text = text[:_MAX_TEXT_LENGTH]

        return {
            "success": True,
            "result": text,
            "source": url,
            "truncated": truncated,
        }
