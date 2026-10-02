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

from fastapi import APIRouter, Depends, HTTPException, Request, status

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