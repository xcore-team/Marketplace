from contextlib import asynccontextmanager

from fastapi import FastAPI
from xcore import Xcore

xcore = Xcore(config_path="integration.yaml")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await xcore.boot(app)
    yield
    await xcore.shutdown()


app = FastAPI(
    lifespan=lifespan,

)


@app.get("/health")
async def health():
    return {"status": "ok"}
