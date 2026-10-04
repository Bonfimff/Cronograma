"""
Treino de conversa: o amigo conduz em inglês, uma pergunta por vez.

Pedido de quem usa o app: "vamos treinar uma conversa de apresentação" e "por que não
usou as palavras do meu vocabulário para fazer essas perguntas?". O modelo pequeno
inventa perguntas ("What is your wark?"); aqui as perguntas vêm das frases de estudo
da pessoa (examples do banco) e de umas poucas fixas, só quando as palavras delas
estão no vocabulário. Cada pergunta vai em inglês com a tradução embaixo.

Sem estado no servidor: a conversa inteira chega a cada mensagem, e a última fala do
amigo traz a marca "🎯 Treino k/n", que diz em que pergunta estamos.

A correção é gentil e previsível: trocas comuns de quem fala português (may → my,
end → and) e palavras do vocabulário escritas parecido (wark → work).
"""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Record, User
from .vocabulario import carregar

MARCA = re.compile(r"🎯 Treino (\d+)/(\d+)")
COMECAR = re.compile(
    r"\b(vamos|bora|quero|podemos|vamo)\s+(treinar|praticar)\b|\btreinar\s+(uma\s+)?conversa\b|\bmodo\s+treino\b"
    r"|\bpraticar\s+(a\s+|uma\s+)?(conversa|apresenta)",
    re.IGNORECASE,
)
PARAR = re.compile(r"\b(parar|sair|chega|terminar|encerrar)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Pergunta:
    en: str
    pt: str
    modelo: str          # um jeito de responder, mostrado quando a pessoa trava
    aceita: str          # regex: a resposta parece responder a pergunta?


# perguntas de apresentação que o app conhece, e quando entram (palavras do vocabulário)
FIXAS = [
    (("name",), Pergunta("What is your name?", "Qual é o seu nome?", "My name is ____.", r"\b(my name is|i am|i'm|im)\b")),
]
# como responder às perguntas que vêm das frases de estudo
MODELOS = [
    (r"^how are you", "I'm fine, thanks. And you?", r"\b(i am|i'm|im|fine|good|great|ok|okay|well|tired|so so)\b"),
    (r"^what do you do", "I am a ____. / I work as a ____.", r"\b(i am|i'm|im|i work)\b"),
    (r"^where do you work", "I work at ____.", r"\b(i work|at|in|from home)\b"),
    (r"^where do you live", "I live in ____.", r"\b(i live|in)\b"),
    (r"^what is your name", "My name is ____.", r"\b(my name is|i am|i'm|im)\b"),
]
FECHO = ("Nice to meet you!", "Prazer em conhecer você!")


def _frases_de_estudo(db: Session, user: User) -> list[tuple[str, str]]:
    linhas = db.scalars(
        select(Record).where(
            Record.user_id == user.id, Record.kind == "content",
            Record.record_id.like("examples:%"), Record.deleted.is_(False),
        )
    ).all()
    out = []
    for r in linhas:
        d = r.data or {}
        en, pt = str(d.get("en") or "").strip(), str(d.get("pt") or "").strip()
        if en and pt:
            out.append((en, pt))
    return out


def _treino_das_aulas(db: Session, user: User) -> list[Pergunta]:
    """
    Perguntas escritas no pacote semanal (sessão.treino): a aula mais recente primeiro. A resposta
    vale se vier em inglês; o modelo de resposta, quando veio, é a dica.
    """
    linhas = db.scalars(
        select(Record).where(Record.user_id == user.id, Record.kind == "session", Record.deleted.is_(False))
    ).all()
    sessoes = sorted((r.data or {} for r in linhas), key=lambda d: str(d.get("date") or ""), reverse=True)
    out: list[Pergunta] = []
    for s in sessoes:
        for t in s.get("treino") or []:
            en = str((t or {}).get("en") or "").strip()
            if en and not any(p.en.lower() == en.lower() for p in out):
                out.append(Pergunta(en, str(t.get("pt") or ""), str(t.get("resposta") or "Answer in English."), r"[a-z]{2,}"))
    return out


def perguntas(db: Session, user: User) -> list[Pergunta]:
    """As perguntas do treino, sempre na mesma ordem (o estado vive só na conversa)."""
    das_aulas = _treino_das_aulas(db, user)
    if das_aulas:
        return das_aulas[:5]
    vocab = {p.en.lower() for p in carregar(db, user, 100000, todas=True)}
    lista: list[Pergunta] = []
    for exige, p in FIXAS:
        if all(w in vocab for w in exige):
            lista.append(p)
    for en, pt in sorted(_frases_de_estudo(db, user)):
        if not en.endswith("?") or not re.search(r"\byou\b", en, re.IGNORECASE):
            continue  # conversa é com a pessoa: "How is she?" fica para outro treino
        modelo = next(((m, a) for padrao, m, a in MODELOS if re.search(padrao, en, re.IGNORECASE)), None)
        if not modelo or any(x.en.lower() == en.lower() for x in lista):
            continue
        lista.append(Pergunta(en, pt, modelo[0], modelo[1]))
    # ordem de uma apresentação: nome, como vai, o que faz, onde trabalha, onde mora
    ordem = ["name", "how are", "what do you do", "where do you work", "where do you live"]
    lista.sort(key=lambda p: next((i for i, o in enumerate(ordem) if o in p.en.lower()), len(ordem)))
    return lista[:5]


# ---------- inglês ou português? ----------
# O detector geral do app tolera inglês no meio do português (é o jeito do chat); aqui a
# pergunta é outra: a pessoa respondeu em inglês? Frases curtas como "I am a teacher."
# precisam contar como inglês.
EN = {
    "i", "i'm", "im", "am", "is", "are", "my", "your", "you", "name", "work", "at", "home", "the", "a", "an",
    "fine", "good", "thanks", "and", "what", "where", "how", "do", "does", "live", "teacher", "in", "from",
    "yes", "no", "not", "it", "it's", "we", "they", "he", "she", "nice", "meet", "to", "too", "as", "may", "end",
    "wark", "ok", "okay", "great", "well", "student", "job", "company", "office", "school",
}
PT = {
    "eu", "sou", "estou", "você", "voce", "vc", "meu", "minha", "nome", "é", "e", "não", "nao", "sim", "de", "que",
    "trabalho", "em", "casa", "quero", "parar", "como", "está", "esta", "obrigado", "obrigada", "bem", "um", "uma",
    "o", "os", "as", "no", "na", "com", "para", "pra", "por", "qual", "onde", "faz", "professor", "vamos", "isso",
}


def parece_ingles(texto: str) -> bool:
    palavras = re.findall(r"[a-zà-ÿ']+", texto.lower())
    if not palavras:
        return False
    if re.search(r"[áàâãéêíóôõúç]", texto.lower()):
        return False
    en = sum(w in EN for w in palavras)
    pt = sum(w in PT and w not in EN for w in palavras)
    return en > pt

# ---------- correção gentil ----------

TROCAS = {
    "may": "my", "end": "and", "ar": "are", "yu": "you", "u": "you", "ur": "your", "yor": "your",
    "im": "I'm", "i": "I", "wat": "what", "wath": "what", "nem": "name", "neim": "name",
    "fain": "fine", "gud": "good", "tanks": "thanks", "tenks": "thanks",
    "nais": "nice", "mit": "meet", "wark": "work", "worke": "work", "dont": "don't", "doo": "do",
}
COMUNS = {
    "i", "am", "is", "are", "you", "your", "my", "name", "and", "the", "a", "an", "at", "in", "on", "to",
    "fine", "good", "thanks", "nice", "meet", "work", "do", "what", "where", "how", "live", "from", "yes", "no",
}


def _distancia(a: str, b: str) -> int:
    ant = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        atual = [i]
        for j, cb in enumerate(b, 1):
            atual.append(min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (ca != cb)))
        ant = atual
    return ant[-1]


def corrigir(texto: str, vocabulario: set[str]) -> str:
    """Corrige o que dá para corrigir com segurança; o resto fica como a pessoa escreveu."""
    conhecidas = COMUNS | vocabulario

    def troca(m: re.Match) -> str:
        w = m.group(0)
        baixa = w.lower()
        if baixa in TROCAS:
            novo = TROCAS[baixa]
        elif len(baixa) >= 4 and baixa not in conhecidas:
            perto = [v for v in vocabulario if len(v) >= 4 and _distancia(baixa, v) == 1]
            novo = perto[0] if len(perto) == 1 else w
        else:
            novo = w
        if novo != "I" and novo != "I'm" and w[:1].isupper():
            novo = novo[:1].upper() + novo[1:]
        return novo

    saida = re.sub(r"[A-Za-z']+", troca, texto.strip())
    return saida[:1].upper() + saida[1:] if saida else saida


# ---------- a conversa ----------

def _bloco(n: int, total: int, p: Pergunta) -> str:
    return f"🎯 Treino {n}/{total}\n{p.en}" + (f"\n({p.pt})" if p.pt else "")


def _fecho() -> str:
    return f"🎯 Treino concluído!\n{FECHO[0]}\n({FECHO[1]})\nQuer treinar de novo? É só dizer \"vamos treinar\"."


def responder_treino(db: Session, user: User, conversa: list[dict]) -> str | None:
    """A resposta do treino, ou None quando a mensagem não é do treino."""
    if not conversa or conversa[-1].get("role") != "user":
        return None
    fala = str(conversa[-1].get("content") or "").strip()
    anterior = next((m["content"] for m in reversed(conversa[:-1]) if m.get("role") == "assistant"), "")
    marca = MARCA.search(anterior or "")

    if not marca:
        if not COMECAR.search(fala):
            return None
        lista = perguntas(db, user)
        if not lista:
            return "Para treinar, preciso de perguntas no seu vocabulário. Estude uma aula de apresentação e volte aqui!"
        return (
            "Bora treinar! Eu pergunto em inglês, você responde em inglês. Se travar, eu mostro um jeito de dizer.\n\n"
            + _bloco(1, len(lista), lista[0])
        )

    if PARAR.search(fala) and not parece_ingles(fala):
        return "Treino encerrado. Quando quiser, é só dizer \"vamos treinar\"."
    lista = perguntas(db, user)
    k = int(marca.group(1))
    if not lista or k > len(lista):
        return None
    atual = lista[k - 1]

    if not parece_ingles(fala):
        if fala.endswith("?"):
            return None  # pergunta de outra coisa: sai do treino e a conversa segue normal
        return f"Tenta em inglês 🙂 Um jeito de dizer: {atual.modelo}\n\n" + _bloco(k, len(lista), atual)

    vocab = {p.en.lower() for p in carregar(db, user, 100000, todas=True)}
    corrigida = corrigir(fala, vocab)
    sem_pontuacao = lambda s: re.sub(r"[^a-z' ]", "", s.lower()).strip()  # noqa: E731
    if sem_pontuacao(corrigida) != sem_pontuacao(fala):
        retorno = f"Quase! Fica assim: {corrigida}"
    elif re.search(atual.aceita, fala, re.IGNORECASE):
        retorno = "Muito bem! ✓"
    else:
        retorno = f"Boa tentativa! Um jeito de responder: {atual.modelo}"

    if k >= len(lista):
        return f"{retorno}\n\n{_fecho()}"
    return f"{retorno}\n\n{_bloco(k + 1, len(lista), lista[k])}"


def correcao_fora_do_treino(db: Session, user: User, conversa: list[dict]) -> str:
    """Fora do treino: se a pessoa escreveu em inglês com algo para corrigir, a linha de correção."""
    if not conversa or conversa[-1].get("role") != "user":
        return ""
    fala = str(conversa[-1].get("content") or "").strip()
    if not fala or not parece_ingles(fala):
        return ""
    vocab = {p.en.lower() for p in carregar(db, user, 100000, todas=True)}
    corrigida = corrigir(fala, vocab)
    limpa = lambda s: re.sub(r"[^a-z' ]", "", s.lower()).strip()  # noqa: E731
    return f"✎ Em inglês, fica assim: {corrigida}\n\n" if limpa(corrigida) != limpa(fala) else ""