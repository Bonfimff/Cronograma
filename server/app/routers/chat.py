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
from functools import partial

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..chat_slot import responder
from ..config import settings
from ..conhecimento import contexto_do_app, pergunta_sobre_o_app, pergunta_sobre_vocabulario, resposta_direta
from ..db import db_session
from ..deps import current_user
from ..idioma import parece_portugues
from ..marcacao import limpar, marcar, marcar_lista
from ..models import User
from ..schemas import ChatIn, ChatOut
from ..vocabulario import Palavra, carregar

router = APIRouter(prefix="/chat", tags=["conversa"])

FILA = asyncio.Lock()

# A instrução vai em inglês de propósito: um modelo pequeno obedece melhor a
# comandos em inglês, mesmo quando o que se pede é uma resposta em português.
AMIGO = """You are a Brazilian friend chatting by text message.

RULE 1, above everything else: write every reply in Brazilian Portuguese. Even
when the other person writes in English, you answer in Portuguese.

RULE 2: keep it short. Two or three sentences, like a text message, ending with
one question.

RULE 3: never teach, never correct the other person, never explain a word.

RULE 4: never repeat a question you already asked in this conversation."""

# Uma palavra por vez, e opcional. Testado contra o modelo: com uma lista, ele
# trata as palavras como tarefa e deforma a frase ("Workou bastante", "(work)
# break(res)?"); com uma só, oferecida como possibilidade, sai natural
# ("Preciso de um break agora mesmo").
OFERTA = """

There is one English word you MAY use in this reply: "{en}" ({pt}). Use it only
if it falls naturally into your Portuguese sentence, the way Brazilians really
talk ("preciso de um break", "foi um perrengue no work"). If it does not fit,
do not use it at all: most replies carry no English, and that is correct. Never
bend a Portuguese word into English, never write the word by itself, never put
it in parentheses."""

SEM_OFERTA = """

Write in Portuguese only, with no English words."""

INSISTIR = """

Your previous reply was in English and was rejected. Write in Portuguese."""

FORA_DO_AR = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="O modelo está fora do ar agora. Tente de novo mais tarde.",
)


def _escolher(palavras: list[Palavra], conversa: list[dict]) -> Palavra | None:
    """
    A palavra da vez: a mais urgente que ainda não apareceu há pouco. Repetir a
    mesma palavra em respostas seguidas cansa e não ensina.
    """
    recente = " ".join(m["content"] for m in conversa[-6:]).lower()
    for p in palavras:
        if p.en.lower() not in recente:
            return p
    return None


def _instrucao(palavra: Palavra | None, insistir: bool = False) -> str:
    corpo = AMIGO + (OFERTA.format(en=palavra.en, pt=palavra.pt) if palavra else SEM_OFERTA)
    return corpo + INSISTIR if insistir else corpo


def _pedir(mensagens: list[dict], limite: int) -> str:
    """Chamada ao Ollama. Bloqueante: roda fora do laço de eventos."""
    cfg = settings()
    corpo = json.dumps(
        {
            "model": cfg.ollama_model,
            "messages": mensagens,
            "stream": False,
            "options": {
                "num_predict": limite,
                # castiga a repetição: o modelo estava refazendo a mesma pergunta
                "repeat_penalty": 1.25,
                "temperature": 0.85,
            },
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


async def _conversar_slot(
    limite: int, conversa: list[dict], vocabulario: list[Palavra], sobre_o_app: str
) -> ChatOut:
    """
    O modelo escreve em português e marca as palavras que ficariam naturais em inglês; o
    servidor faz a troca (ver chat_slot.py). A conferência de idioma, de lista recitada e de
    pergunta repetida fica lá dentro.
    """
    cfg = settings()
    async with FILA:
        try:
            resposta = await asyncio.to_thread(
                partial(
                    responder, cfg.ollama_url, cfg.ollama_model, conversa, vocabulario, limite, cfg.ollama_timeout,
                    sobre_o_app=sobre_o_app, minimo_trocas=cfg.chat_trocas_minimo, maximo_trocas=cfg.chat_trocas_maximo,
                )
            )
            texto = resposta["texto"]
        except (urllib.error.URLError, TimeoutError, OSError):
            raise FORA_DO_AR from None
        except (json.JSONDecodeError, KeyError):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="O modelo respondeu de um jeito que não entendi.",
            ) from None

    if not texto:
        raise FORA_DO_AR
    # se mesmo depois de pedir de novo veio em inglês, entrega sem marcar (como no modo livre)
    if not parece_portugues(texto):
        return ChatOut(reply=limpar(texto), glossary=[])
    marcado, glossario = marcar(texto, vocabulario)
    return ChatOut(reply=marcado, glossary=glossario)


@router.post("", response_model=ChatOut)
async def conversar(
    entrada: ChatIn,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> ChatOut:
    vocabulario = carregar(db, user, 400)  # o vocabulário todo: a troca consulta todas as fichas
    # o histórico volta sem as marcas: elas são enfeite nosso, o modelo não precisa vê-las
    conversa = [{"role": m.role, "content": limpar(m.content)} for m in entrada.messages]

    if settings().chat_modo == "slot":
        # perguntas sobre o app, a conta e os dados da pessoa têm resposta pronta: sem modelo, sem erro
        direta = resposta_direta(db, user, conversa)
        if direta:
            if "\n• " in direta:  # lista de vocabulário: todas as palavras marcadas, inclusive you, to, do
                marcado, glossario = marcar_lista(direta, carregar(db, user, 100000, todas=True))
            else:
                marcado, glossario = marcar(direta, vocabulario)
            return ChatOut(reply=marcado, glossary=glossario)
        # o guia do app só entra quando a pessoa pergunta do app: em toda conversa, ele atrapalha
        sobre = contexto_do_app(db, user, pergunta_sobre_vocabulario(conversa)) if pergunta_sobre_o_app(conversa) else ""
        return await _conversar_slot(entrada.limit, conversa, vocabulario, sobre)

    # modo "livre": o modelo escreve o inglês sozinho, uma palavra por vez
    palavra = _escolher(vocabulario, conversa)

    async def gerar(insistir: bool) -> str:
        mensagens = [{"role": "system", "content": _instrucao(palavra, insistir)}] + conversa
        try:
            return await asyncio.to_thread(_pedir, mensagens, entrada.limit)
        except (urllib.error.URLError, TimeoutError, OSError):
            raise FORA_DO_AR from None
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="O modelo respondeu de um jeito que não entendi.",
            ) from None

    async with FILA:
        texto = await gerar(False)
        # escapou para o inglês: uma segunda chance, dizendo isso na cara dele
        if texto and not parece_portugues(texto):
            texto = await gerar(True) or texto

    if not texto:
        raise FORA_DO_AR

    # se mesmo assim veio em inglês, entregamos sem marcar: marcar palavra dentro
    # de uma frase inglesa não ensina nada, só suja a tela
    if not parece_portugues(texto):
        return ChatOut(reply=limpar(texto), glossary=[])

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
