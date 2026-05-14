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
from starlette.middleware.gzip import GZipMiddleware
from xcore import Xcore

from extensions.xwebsocket.main import WsManager
from middleware import (
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
    UploadSizeLimitMiddleware,
    cors_middleware,
)

logger = logging.getLogger("xcore-market")

xcore = Xcore(config_path="integration.yaml")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await xcore.boot(app)
    await xcore.health.run_all(timeout=5)
    app.state.xcore_metrics = xcore.metrics
    yield
    await xcore.shutdown()


app = FastAPI(
    title=xcore._config.app.name,
    description="Marketplace de plugins xcore",
    version="1.0.0",
    lifespan=lifespan,
    debug=xcore._config.app.debug,
    
)

# ── Middlewares (ordre LIFO : le dernier ajouté est exécuté en premier) ───────

# 1. CORS — doit être en tête de chaîne
cors_middleware(
    app,
    allowed_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
)

# 2. Sécurité HTTP headers
app.add_middleware(SecurityHeadersMiddleware)

# 3. Rate limiting — 200 req/min par IP
app.add_middleware(RateLimitMiddleware, calls=200, period_seconds=60)

# 4. Limite taille upload ZIP — 10 MB
app.add_middleware(UploadSizeLimitMiddleware, max_bytes=10 * 1024 * 1024)

# 5. Compression GZip pour les réponses >= 1 KB
app.add_middleware(GZipMiddleware, minimum_size=1024)


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
