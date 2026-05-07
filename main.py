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
from contextlib import asynccontextmanager

from fastapi import FastAPI
from xcore import Xcore

logger = logging.getLogger("xcore-market")

xcore = Xcore(config_path="integration.yaml")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await xcore.boot(app)
    yield
    await xcore.shutdown()


app = FastAPI(
    title="xcore-market",
    description="Marketplace de plugins xcore",
    version="1.0.0",
    lifespan=lifespan,
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="debug",
    )
