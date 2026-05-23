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

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from xcore import Xcore

from middleware import cors_middleware

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
    **xcore._config.app.fastapi.__dict__,
    lifespan=lifespan,
)

# ── Middlewares (ordre LIFO : le dernier ajouté est exécuté en premier) ───────
xcore.setup(app=app)

# 1. CORS — doit être en tête de chaîne
cors_middleware(app, allowed_origins=xcore._config.cors.allow_origins)


# Serve static files from frontend build
dist_path = os.path.join(os.getcwd(), "static", "dist")
if os.path.exists(dist_path):
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
