"""
Conversa com o modelo de linguagem.

O modelo não roda neste servidor: ele vive no computador de casa, no Ollama, e
chega aqui por um túnel SSH reverso. Para esta rota, é só um endereço local
(127.0.0.1:11434) que pode estar fora do ar quando o computador está desligado.

Uma consulta por vez: o Ollama está com NUM_PARALLEL=1, então a fila é feita
aqui, com um cadeado, em vez de deixar as requisições se atropelarem lá.
"""

import asyncio
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..deps import current_user
from ..models import User
from ..schemas import ChatIn, ChatOut

router = APIRouter(prefix="/chat", tags=["conversa"])

FILA = asyncio.Lock()

PROFESSOR = (
    "You are a friendly English tutor talking with a Brazilian learner at an "
    "intermediate level. Reply in English, in at most four short sentences, and "
    "keep the conversation going with one question. When the learner makes a "
    "mistake, repeat the sentence correctly in one short line starting with "
    "'Better:' before your reply. If the learner writes in Portuguese, answer in "
    "English and give the English they were looking for."
)

FORA_DO_AR = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="O modelo está fora do ar agora. Tente de novo mais tarde.",
)


def _pedir(mensagens: list[dict], limite: int) -> str:
    """Chamada ao Ollama. Bloqueante: roda fora do laço de eventos."""
    cfg = settings()
    corpo = json.dumps(
        {
            "model": cfg.ollama_model,
            "messages": mensagens,
            "stream": False,
            "options": {"num_predict": limite},
        }
    ).encode()
    req = urllib.request.Request(
        f"{cfg.ollama_url}/api/chat",
        data=corpo,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=cfg.ollama_timeout) as r:
        resposta = json.loads(r.read())
    return (resposta.get("message") or {}).get("content", "").strip()


@router.post("", response_model=ChatOut)
async def conversar(entrada: ChatIn, _: User = Depends(current_user)) -> ChatOut:
    mensagens = [{"role": "system", "content": PROFESSOR}]
    mensagens += [{"role": m.role, "content": m.content} for m in entrada.messages]

    async with FILA:
        try:
            texto = await asyncio.to_thread(_pedir, mensagens, entrada.limit)
        except (urllib.error.URLError, TimeoutError, OSError):
            raise FORA_DO_AR from None
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="O modelo respondeu de um jeito que não entendi.",
            ) from None

    if not texto:
        raise FORA_DO_AR
    return ChatOut(reply=texto)


@router.get("/saude", tags=["serviço"])
async def saude(_: User = Depends(current_user)) -> dict:
    """Diz se o túnel e o Ollama estão de pé, sem gastar o modelo."""
    cfg = settings()
    try:
        await asyncio.to_thread(
            lambda: urllib.request.urlopen(f"{cfg.ollama_url}/api/version", timeout=5).read()
        )
    except (urllib.error.URLError, TimeoutError, OSError):
        return {"ok": False}
    return {"ok": True}
