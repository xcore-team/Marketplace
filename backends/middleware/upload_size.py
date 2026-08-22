from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

_DEFAULT_MAX = 10 * 1024 * 1024  # 10 MB
# path prefix -> max bytes. Un artefact .xdeploy (projet multi-plugins
# scellé) peut légitimement dépasser de loin un ZIP de plugin unique — voir
# app/xdeploy/src/services/artifact.py — d'où un plafond dédié, plus large,
# plutôt que d'exempter la route ou de relever le défaut pour tout le monde.
_UPLOAD_PATHS: dict[str, int] = {
    "/app/marketplace/submissions": _DEFAULT_MAX,
    "/app/github": _DEFAULT_MAX,
    "/app/xdeploy/v1/projects/": 200 * 1024 * 1024,  # 200 MB
}


class UploadSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Refuse tout upload dépassant la limite de son chemin (voir _UPLOAD_PATHS).
    Vérifie Content-Length d'abord (rapide), puis lit le body si absent.
    """

    def __init__(self, app, max_bytes: int = _DEFAULT_MAX) -> None:
        super().__init__(app)
        self._max = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method not in ("POST", "PUT", "PATCH"):
            return await call_next(request)

        path = request.url.path
        limit = next((v for p, v in _UPLOAD_PATHS.items() if path.startswith(p)), None)
        if limit is None:
            return await call_next(request)

        content_length = request.headers.get("Content-Length")
        if content_length and int(content_length) > limit:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Fichier trop volumineux. Maximum autorisé : {limit // (1024 * 1024)} MB."},
            )

        return await call_next(request)
