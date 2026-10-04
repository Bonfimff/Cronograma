"""
Análise do progresso pela IA.

O app calcula os números (core/progress/relatorio.ts) e manda só o resumo em texto; o
modelo escreve a leitura em português: evolução, dificuldades, padrões, melhor horário
e o que fazer a seguir. Ele não vê o histórico bruto e não pode citar número que não
esteja no resumo: se citar, a análise é descartada e volta a versão por regras.
"""

import asyncio
import json
import re
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import current_user
from ..models import User

router = APIRouter(prefix="/progresso", tags=["progresso"])

INSTRUCAO = """You are a study coach inside an English-study app for a Brazilian learner.
You receive a summary of the learner's numbers. Write the analysis in Brazilian Portuguese.

Rules:
- Use ONLY the numbers and words that appear in the summary. Never invent a number.
- Exactly 5 short bullet lines, each starting with "• ", in this order:
  1. evolução (last 7 days vs the week before, this month vs last month, skill levels);
  2. pontos fortes (memory, words that stuck, the highest step of the mastery ladder reached);
  3. dificuldades (words about to be forgotten, words with more errors, pronunciation patterns);
  4. padrão e melhor horário (when the learner studies, performs and remembers next day best);
  5. próximo passo (one concrete suggestion: which words to review and in which activity).
- Friendly and direct, at most 30 words per bullet. No title, no extra text."""


class AnaliseIn(BaseModel):
    resumo: str = Field(min_length=10, max_length=4000)


class AnaliseOut(BaseModel):
    texto: str
    fonte: str  # "ia" ou "regras"


def _numeros(texto: str) -> set[str]:
    return set(re.findall(r"\d+", texto))


def _chamar(resumo: str) -> str:
    cfg = settings()
    corpo = {
        "model": cfg.ollama_model, "stream": False,
        "messages": [{"role": "system", "content": INSTRUCAO}, {"role": "user", "content": resumo}],
        "options": {"temperature": 0.3, "num_predict": 320},
    }
    pedido = urllib.request.Request(
        cfg.ollama_url.rstrip("/") + "/api/chat", data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(pedido, timeout=cfg.ollama_timeout) as r:
        return (json.loads(r.read()).get("message") or {}).get("content", "").strip()


def validar(texto: str, resumo: str) -> str | None:
    """Só aceita 3 a 6 tópicos e nenhum número que não esteja no resumo."""
    linhas = [l.strip() for l in texto.splitlines() if l.strip().startswith(("•", "-", "*"))]
    linhas = ["• " + l.lstrip("•-* ").strip() for l in linhas]
    if not 3 <= len(linhas) <= 6:
        return None
    if _numeros("\n".join(linhas)) - _numeros(resumo) - {str(n) for n in range(1, 8)}:
        return None  # número inventado
    return "\n".join(linhas)


@router.post("/analise", response_model=AnaliseOut)
async def analisar(entrada: AnaliseIn, user: User = Depends(current_user)) -> AnaliseOut:
    try:
        bruto = await asyncio.to_thread(_chamar, entrada.resumo)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="A IA está fora do ar agora.") from None
    texto = validar(bruto, entrada.resumo)
    if not texto:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A IA não respondeu no formato esperado.")
    return AnaliseOut(texto=texto, fonte="ia")
