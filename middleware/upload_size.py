from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_UPLOAD_PATHS = ("/app/marketplace/submissions", "/app/github")
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


class UploadSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Refuse tout upload dépassant 10 MB sur les routes de soumission.
    Vérifie Content-Length d'abord (rapide), puis lit le body si absent.
    """

    def __init__(self, app, max_bytes: int = _MAX_BYTES) -> None:
        super().__init__(app)
        self._max = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method not in ("POST", "PUT", "PATCH"):
            return await call_next(request)

        path = request.url.path
        if not any(path.startswith(p) for p in _UPLOAD_PATHS):
            return await call_next(request)

        content_length = request.headers.get("Content-Length")
        if content_length and int(content_length) > self._max:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Fichier trop volumineux. Maximum autorisé : {self._max // (1024 * 1024)} MB."},
            )

        return await call_next(request)
