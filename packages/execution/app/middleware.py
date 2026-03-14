"""Custom ASGI middleware — request IDs and content-type enforcement."""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique request ID to every request/response.

    Reads ``X-Request-ID`` from the incoming request.  If missing,
    generates a UUID.  The ID is set on ``request.state.request_id``
    and returned in the ``X-Request-ID`` response header.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class ContentTypeMiddleware(BaseHTTPMiddleware):
    """Reject mutation requests without ``application/json`` content type.

    Returns 415 Unsupported Media Type for POST/PUT/PATCH requests
    that don't declare ``Content-Type: application/json``.
    GET, DELETE, OPTIONS, and HEAD are exempt.
    """

    _ENFORCED_METHODS = {"POST", "PUT", "PATCH"}

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in self._ENFORCED_METHODS:
            content_type = request.headers.get("content-type", "")
            if "application/json" not in content_type:
                return JSONResponse(
                    status_code=415,
                    content={
                        "detail": "Content-Type must be application/json",
                        "status_code": 415,
                    },
                )
        return await call_next(request)
