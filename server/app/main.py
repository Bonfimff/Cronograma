"""
API do Inglês Híbrido: contas e sincronização entre aparelhos.

O aplicativo continua funcionando offline, no navegador; o servidor guarda uma
cópia do que já foi estudado e entrega para os outros aparelhos da mesma conta.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import create_all
from .routers import auth, chat, sync

@asynccontextmanager
async def lifespan(_: FastAPI):
    create_all()  # cria as tabelas que ainda não existem
    yield


app = FastAPI(
    title="Inglês Híbrido — API",
    version="0.1.0",
    description="Contas e sincronização dos dados de estudo.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings().origins,
    allow_credentials=False,  # o token vai no cabeçalho Authorization, não em cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(chat.router)


@app.get("/saude", tags=["serviço"])
def saude() -> dict:
    return {"ok": True}
