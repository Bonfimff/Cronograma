"""
Conversa com o modelo de linguagem.

O modelo não roda neste servidor: ele vive no computador de casa, no Ollama, e
chega aqui por um túnel. Para esta rota, é só um endereço que pode estar fora do
ar quando o computador está desligado.

A divisão de trabalho é esta: o modelo só gera texto. Quem sabe quem é o
usuário, quais palavras ele estudou e o que está vencido para revisão é este
servidor, que monta a instrução, confere a resposta e marca as palavras.

Uma consulta por vez: o Ollama está com NUM_PARALLEL=1, então a fila é feita
aqui, com um cadeado, em vez de deixar as requisições se atropelarem lá.
"""

import asyncio
import json
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..db import db_session
from ..deps import current_user
from ..marcacao import limpar, marcar
from ..models import User
from ..schemas import ChatIn, ChatOut
from ..vocabulario import Palavra, carregar

router = APIRouter(prefix="/chat", tags=["conversa"])

FILA = asyncio.Lock()

AMIGO = """Você é um amigo brasileiro conversando por mensagens. Converse em
português, de forma leve e curta: no máximo três frases, e termine com uma
pergunta para o assunto continuar.

No meio da conversa, troque por inglês as palavras da lista abaixo, mas só
quando couberem com naturalidade na frase, do jeito que a gente fala ("Hi, bom
dia!", "preciso de um break"). Se nenhuma couber, converse sem nenhuma palavra
em inglês: é melhor assim do que enfiar palavra à força. Nunca escreva a
tradução ao lado, nunca explique a palavra e nunca dê aula.

Não corrija o português nem o inglês de quem fala com você. Se não entender
alguma coisa, pergunte o que a pessoa quis dizer, como qualquer amigo faria."""

FORA_DO_AR = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="O modelo está fora do ar agora. Tente de novo mais tarde.",
)

# quantas palavras do vocabulário vão na instrução (as mais urgentes)
NA_INSTRUCAO = 12


def _instrucao(palavras: list[Palavra]) -> str:
    if not palavras:
        return AMIGO + "\n\nA pessoa ainda não estudou nenhuma palavra: converse só em português."
    lista = ", ".join(f"{p.en} ({p.pt})" for p in palavras[:NA_INSTRUCAO])
    return f"{AMIGO}\n\nPalavras disponíveis hoje: {lista}."


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
async def conversar(
    entrada: ChatIn,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> ChatOut:
    vocabulario = carregar(db, user)
    mensagens = [{"role": "system", "content": _instrucao(vocabulario)}]
    # o histórico volta sem as marcas: elas são enfeite nosso, o modelo não precisa vê-las
    mensagens += [{"role": m.role, "content": limpar(m.content)} for m in entrada.messages]

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

    # a marcação é nossa, não do modelo: comparamos com o vocabulário do banco
    marcado, glossario = marcar(texto, vocabulario)
    return ChatOut(reply=marcado, glossary=glossario)


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


@router.get("/vocabulario", tags=["conversa"])
def vocabulario(
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> dict:
    """O que o chat enxerga do seu vocabulário, na ordem em que vai usar."""
    palavras = carregar(db, user)
    return {"palavras": [{"id": p.id, "en": p.en, "pt": p.pt, "peso": p.peso} for p in palavras]}
