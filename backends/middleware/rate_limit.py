from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# Routes exclues du rate limiting (health, metrics)
_EXCLUDED_PATHS = {"/health", "/metrics", "/docs", "/openapi.json", "/redoc"}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting par IP — fenêtre glissante en mémoire.
    Par défaut : 200 requêtes / 60 secondes (configurable).
    """

    def __init__(self, app, calls: int = 200, period_seconds: int = 60) -> None:
        super().__init__(app)
        self._calls = calls
        self._period = period_seconds
        self._store: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _get_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _EXCLUDED_PATHS:
            return await call_next(request)

        ip = self._get_ip(request)
        now = time.monotonic()
        window_start = now - self._period

        with self._lock:
            timestamps = self._store[ip]
            # Nettoie les entrées hors fenêtre
            self._store[ip] = [t for t in timestamps if t > window_start]
            if len(self._store[ip]) >= self._calls:
                retry_after = int(self._period - (now - self._store[ip][0]))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Trop de requêtes. Réessayez plus tard."},
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
            self._store[ip].append(now)

        return await call_next(request)
