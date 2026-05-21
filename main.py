"""
main.py — Launcher xcore-market.

Démarrage :
    uv run main.py
    # ou
    python main.py
    # ou avec uvicorn directement :
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from xcore import Xcore

from extensions.xwebsocket.main import WsManager
from middleware import (
    SecurityHeadersMiddleware,
    cors_middleware,
)

logger = logging.getLogger("xcore-market")

xcore = Xcore(config_path="integration.yaml")
# entry_point()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await xcore.boot(app)
    await xcore.health.run_all(timeout=5)
    app.state.xcore_metrics = xcore.metrics
    print(xcore.plugins_lists)
    yield
    await xcore.shutdown()


app = FastAPI(
    title=xcore._config.app.fastapi.title,
    description=xcore._config.app.fastapi.description,
    summary=xcore._config.app.fastapi.summary,
    version=xcore._config.app.fastapi.version,
    debug=True,
    lifespan=lifespan,
)

# ── Middlewares (ordre LIFO : le dernier ajouté est exécuté en premier) ───────
xcore.setup(app=app)

# 1. CORS — doit être en tête de chaîne
cors_middleware(
    app,
    allowed_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
)

# 2. Sécurité HTTP headers
app.add_middleware(SecurityHeadersMiddleware)

# 5. Compression GZip pour les réponses >= 1 KB
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Serve static files from frontend build
dist_path = os.path.join(os.getcwd(), "static", "dist")
if os.path.exists(dist_path):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(dist_path, "assets")),
        name="assets",
    )

    from fastapi.responses import FileResponse

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Prevent API routes from being intercepted if needed
        # (Though APIRouter routes are usually checked first)
        file_path = os.path.join(dist_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(dist_path, "index.html"))
else:
    logger.warning("Frontend build directory not found at %s", dist_path)


# ── Gestion d'erreurs globale ─────────────────────────────────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    logger.exception("Erreur non gérée sur %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Erreur interne du serveur."},
    )


@app.websocket("/ws/{channel}")
async def websocket_endpoint(request: Request, websocket: WebSocket, channel: str):
    ws = xcore.services.get_as("ext.web_socket", WsManager)
    if ws:
        await ws.ws_endpoint(websocket, request, channel)
