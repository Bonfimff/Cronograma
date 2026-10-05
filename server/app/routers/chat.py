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
import re
import json
import urllib.error
import urllib.request
from functools import partial

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..chat_slot import responder
from ..config import settings
from ..conhecimento import contexto_do_app, pergunta_sobre_o_app, pergunta_sobre_vocabulario, resposta_direta
from .. import db as db_mod
from ..db import db_session
from ..deps import current_user
from ..idioma import parece_portugues
from ..marcacao import limpar, marcar, marcar_lista
from ..treino import correcao_fora_do_treino, responder_treino
from ..vocab_chat import responder_vocabulario
from ..consultas import responder_consulta
from ..usar_vocabulario import usar_vocabulario
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
    limite: int, conversa: list[dict], vocabulario: list[Palavra], sobre_o_app: str,
    vocab_completo: list[Palavra] | None = None, ao_vivo=None,
) -> ChatOut:
    """
    O modelo escreve em português e marca as palavras que ficariam naturais em inglês; o
    servidor faz a troca (ver chat_slot.py). A conferência de idioma, de lista recitada e de
    pergunta repetida fica lá dentro.
    """
    cfg = settings()
    if ao_vivo and vocab_completo:
        bruto_ao_vivo = ao_vivo

        def ao_vivo(texto: str) -> None:  # noqa: F811 — a mesma tela, já com as palavras em inglês
            # só as palavras já completas: "trabalh" ainda pode virar "trabalho" ou "trabalhar"
            corte = max(texto.rfind(c) for c in " .,!?;:\n")
            pronto, resto = (texto[: corte + 1], texto[corte + 1:]) if corte >= 0 else ("", texto)
            marcado, _ = usar_vocabulario(pronto, vocab_completo, marcas=True)
            bruto_ao_vivo(marcado + resto)
    async with FILA:
        try:
            resposta = await asyncio.to_thread(
                partial(
                    responder, cfg.ollama_url, cfg.ollama_model, conversa, vocabulario, limite, cfg.ollama_timeout,
                    sobre_o_app=sobre_o_app, minimo_trocas=cfg.chat_trocas_minimo, maximo_trocas=cfg.chat_trocas_maximo,
                    vocab_completo=vocab_completo, ao_vivo=ao_vivo,
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
    if resposta.get("marcado") and vocab_completo:
        # as palavras do vocabulário já vêm marcadas no lugar exato (usar_vocabulario.py)
        por_palavra = {p.en.lower(): p for p in vocab_completo}
        usadas = {w.lower() for w in re.findall(r"\[\[([^\]]+)\]\]", resposta["marcado"])}
        glossario = [{"en": por_palavra[w].en, "pt": por_palavra[w].pt, "id": por_palavra[w].id} for w in usadas if w in por_palavra]
        return ChatOut(reply=resposta["marcado"], glossary=glossario)
    # se mesmo depois de pedir de novo veio em inglês, entrega sem marcar (como no modo livre)
    if not parece_portugues(texto):
        return ChatOut(reply=limpar(texto), glossary=[])
    marcado, glossario = marcar(texto, vocabulario)
    return ChatOut(reply=marcado, glossary=glossario)


def _glossario(marcado: str, vocabulario: list[Palavra]) -> list[dict]:
    """O balão de cada palavra marcada com [[ ]]."""
    por_palavra = {p.en.lower(): p for p in vocabulario}
    usadas = {w.lower() for w in re.findall(r"\[\[([^\]]+)\]\]", marcado)}
    return [{"en": por_palavra[w].en, "pt": por_palavra[w].pt, "id": por_palavra[w].id} for w in usadas if w in por_palavra]


def _marcar_com_traducao(texto: str, vocabulario: list[Palavra]) -> tuple[str, list[dict]]:
    """Marca só as palavras escritas como "hi (oi)": o português em volta fica sem marca."""
    por_palavra = {p.en.lower(): p for p in vocabulario}
    glossario = {}

    def troca(m: re.Match) -> str:
        # a expressão mais longa que termina antes do "(": "thank you (obrigado)" marca as duas palavras
        termos = m.group(1).split()
        for k in range(len(termos)):
            candidato = " ".join(termos[k:])
            p = por_palavra.get(candidato.lower())
            if p:
                glossario[p.en.lower()] = {"en": p.en, "pt": p.pt, "id": p.id}
                antes = " ".join(termos[:k])
                return (antes + " " if antes else "") + f"[[{candidato}]] ("
        return m.group(0)

    return re.sub(r"\b((?:[A-Za-z][A-Za-z'-]* ){0,4}[A-Za-z][A-Za-z'-]*) \(", troca, texto), list(glossario.values())


def _marcar_linhas_em_ingles(texto: str, vocabulario: list[Palavra]) -> tuple[str, list[dict]]:
    """No treino, só as linhas em inglês ganham palavras vivas ("do" e "a" do português não)."""
    linhas, glossario = [], {}
    for linha in texto.split("\n"):
        if linha.strip() and not linha.startswith(("🎯", "(")) and not parece_portugues(linha):
            marcada, itens = marcar(linha, vocabulario, maximo=12)
            linhas.append(marcada)
            glossario.update({g["en"].lower(): g for g in itens})
        else:
            linhas.append(linha)
    return "\n".join(linhas), list(glossario.values())


@router.post("", response_model=ChatOut)
async def conversar(
    entrada: ChatIn,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> ChatOut:
    return await _conversar(entrada, user, db)


@router.post("/stream")
async def conversar_ao_vivo(
    entrada: ChatIn,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> StreamingResponse:
    """
    A mesma conversa, mas a resposta do modelo chega enquanto é escrita: uma linha JSON por
    pedaço, {"parcial": "texto até aqui"}, e no fim {"final": {reply, glossary}} já com as
    palavras do vocabulário trocadas e marcadas (ou {"erro": ..., "status": ...}). Respostas que
    não passam pelo modelo (treino, consultas, vocabulário) chegam direto no "final".
    """
    laco = asyncio.get_running_loop()
    fila: asyncio.Queue = asyncio.Queue()

    def ao_vivo(texto: str) -> None:  # chamado na thread do modelo
        laco.call_soon_threadsafe(fila.put_nowait, {"parcial": texto})

    usuario_id = user.id

    async def trabalhar() -> None:
        # sessão própria: a da requisição fecha antes de a resposta em pedaços terminar
        try:
            with db_mod.SessionLocal() as sessao:
                r = await _conversar(entrada, sessao.get(User, usuario_id), sessao, ao_vivo)
            await fila.put({"final": r.model_dump()})
        except HTTPException as e:
            await fila.put({"erro": e.detail, "status": e.status_code})
        except Exception:  # noqa: BLE001 — a pessoa vê uma mensagem, não a conexão caindo
            await fila.put({"erro": "Não foi possível responder agora.", "status": 500})

    async def linhas():
        tarefa = asyncio.create_task(trabalhar())
        try:
            while True:
                item = await fila.get()
                yield json.dumps(item, ensure_ascii=False) + "\n"
                if "final" in item or "erro" in item:
                    break
        finally:
            if not tarefa.done():
                tarefa.cancel()

    # sem buffer no caminho (nginx), senão os pedaços chegam todos juntos no fim
    return StreamingResponse(linhas(), media_type="application/x-ndjson",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


async def _conversar(entrada: ChatIn, user: User, db: Session, ao_vivo=None) -> ChatOut:
    vocabulario = carregar(db, user, 400)  # o vocabulário todo: a troca consulta todas as fichas
    # o histórico volta sem as marcas: elas são enfeite nosso, o modelo não precisa vê-las
    conversa = [{"role": m.role, "content": limpar(m.content)} for m in entrada.messages]

    if settings().chat_modo == "slot":
        # treino de conversa: perguntas em inglês das frases de estudo, uma por vez (ver treino.py)
        treino = responder_treino(db, user, conversa)
        if treino:
            marcado, glossario = _marcar_linhas_em_ingles(treino, carregar(db, user, 100000, todas=True))
            return ChatOut(reply=marcado, glossary=glossario)
        # adicionar palavra ou conferir se está na lista: feito de verdade, no banco (ver vocab_chat.py)
        vocab = responder_vocabulario(db, user, conversa)
        if vocab:
            marcado, glossario = _marcar_com_traducao(vocab, carregar(db, user, 100000, todas=True))
            return ChatOut(reply=marcado, glossary=glossario)
        # hora, data, tempo, curiosidade, Wikipédia: consultados de verdade pelo servidor (ver consultas.py)
        consulta = responder_consulta(conversa, sobre_o_app=pergunta_sobre_o_app(conversa))
        if consulta:
            if consulta.endswith("(Wikipédia)") and "Neste dia" not in consulta:
                return ChatOut(reply=consulta, glossary=[])  # texto de enciclopédia: sem troca de palavras
            marcado, usadas = usar_vocabulario(consulta, carregar(db, user, 100000, todas=True), marcas=True)
            return ChatOut(reply=marcado, glossary=_glossario(marcado, carregar(db, user, 100000, todas=True)))
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
        resposta = await _conversar_slot(entrada.limit, conversa, vocabulario, sobre, carregar(db, user, 100000, todas=True), ao_vivo)
        # escreveu em inglês com algo a acertar? a correção vem antes da conversa
        correcao = correcao_fora_do_treino(db, user, conversa)
        if correcao:
            resposta.reply = correcao + resposta.reply
        return resposta

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
