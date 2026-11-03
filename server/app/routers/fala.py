"""
Reconhecimento de voz do Fala-Rápida.

Como o modelo de conversa, o Whisper roda no computador de casa e chega aqui pelo
túnel SSH. O celular manda ~2 s de áudio (PCM float32, 16 kHz, mono) e recebe o
texto; o jogo julga a palavra. Se esta rota falhar, o jogo reconhece no próprio
aparelho, como antes.
"""

import asyncio
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import current_user
from ..models import User

router = APIRouter(prefix="/fala", tags=["fala"])

MAX_BYTES = 16000 * 4 * 15  # 15 s: uma palavra nunca passa disso

FORA_DO_AR = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="O reconhecimento de voz está fora do ar agora.",
)


def _saude() -> bool:
    cfg = settings()
    with urllib.request.urlopen(cfg.whisper_url.rstrip("/") + "/saude", timeout=3) as r:
        return bool(json.loads(r.read()).get("ok"))


def _repassar(audio: bytes) -> dict:
    cfg = settings()
    pedido = urllib.request.Request(
        cfg.whisper_url.rstrip("/") + "/transcrever",
        data=audio,
        headers={"Content-Type": "application/octet-stream"},
        method="POST",
    )
    with urllib.request.urlopen(pedido, timeout=cfg.whisper_timeout) as r:
        return json.loads(r.read())


class PedidoVoz(BaseModel):
    texto: str = Field(min_length=1, max_length=600)
    lingua: str = "pt"
    voz: str = "M1"
    velocidade: float = Field(default=1, ge=0.5, le=2)


def _gerar_voz(pedido: PedidoVoz) -> bytes:
    cfg = settings()
    requisicao = urllib.request.Request(
        cfg.voz_url.rstrip("/") + "/falar",
        data=pedido.model_dump_json().encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(requisicao, timeout=cfg.voz_timeout) as r:
        return r.read()


@router.post("/voz")
async def voz(pedido: PedidoVoz, user: User = Depends(current_user)) -> Response:
    """Áudio de uma frase. Se falhar, o app usa a voz baixada no aparelho ou a do sistema."""
    try:
        audio = await asyncio.to_thread(_gerar_voz, pedido)
    except (urllib.error.URLError, TimeoutError, OSError):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="A voz do servidor está fora do ar agora.") from None
    return Response(content=audio, media_type="audio/mpeg")


@router.get("/saude")
async def saude(user: User = Depends(current_user)) -> dict:
    """O reconhecedor está alcançável? O jogo pergunta antes de decidir onde reconhecer."""
    try:
        return {"ok": await asyncio.to_thread(_saude)}
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return {"ok": False}


@router.post("/transcrever")
async def transcrever(request: Request, user: User = Depends(current_user)) -> dict:
    audio = await request.body()
    if not audio or len(audio) > MAX_BYTES or len(audio) % 4:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Áudio inválido.")
    try:
        resposta = await asyncio.to_thread(_repassar, audio)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise FORA_DO_AR from None
    return {"text": str(resposta.get("text") or "")}