"""
O vocabulário do usuário, lido do banco.

O aplicativo não manda a lista de palavras junto com a mensagem: ela já está
aqui, porque a sincronização a trouxe. Quem conversa com o modelo lê daqui.

Uma palavra guardada tem esta cara (é a ficha do aplicativo):

    {"id": "rest", "word": "rest", "translations": [{"text": "descansar"}], ...}

E o histórico de estudo são registros `kind='history'` apontando para
"word:rest", com o evento do dia (praticado, precisa revisar, consolidado).
"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Record, User

# eventos que dizem "esta palavra escorregou"
TROPECOS = {"review_needed", "reinforce_needed"}

# Palavras que não cabem soltas numa frase em português. "Preciso de um break"
# funciona; "Como está o your trabalho?" não funciona, e foi exatamente o que o
# modelo tentou fazer quando elas entraram na lista. Elas continuam no
# vocabulário e no estudo: só não são oferecidas para a conversa.
TIPOS_DE_FUNCAO = {"question word", "pronoun", "preposition", "article",
                   "auxiliary", "conjunction", "determiner"}
FUNCAO = {
    "a", "an", "the", "i", "you", "he", "she", "it", "we", "they", "me", "him",
    "her", "us", "them", "my", "your", "his", "its", "our", "their", "this",
    "that", "these", "those", "am", "is", "are", "was", "were", "be", "been",
    "do", "does", "did", "have", "has", "had", "will", "would", "can", "could",
    "should", "may", "might", "must", "of", "to", "in", "on", "at", "for",
    "with", "from", "by", "as", "and", "or", "but", "if", "than", "then",
    "how", "what", "when", "where", "who", "why", "which", "not", "no", "yes",
    "so", "very", "too", "there", "here",
}


def _cabe_na_conversa(en: str, tipo: str) -> bool:
    """A palavra pode aparecer sozinha dentro de uma frase em português?"""
    return en.lower() not in FUNCAO and tipo.lower() not in TIPOS_DE_FUNCAO


@dataclass(frozen=True)
class Palavra:
    """Uma palavra do vocabulário, reduzida ao que a conversa precisa."""

    id: str           # "words:rest"
    en: str           # "rest"
    pt: str           # "descansar"
    peso: float       # quanto ela merece aparecer agora (maior vem antes)

    @property
    def ref(self) -> str:
        """Como o histórico aponta para ela: "word:rest"."""
        return "word:" + self.id.split(":", 1)[1]


def _traducao(data: dict) -> str:
    traducoes = data.get("translations") or []
    if traducoes and isinstance(traducoes[0], dict):
        return str(traducoes[0].get("text") or "").strip()
    return str(data.get("core_meaning") or "").strip()


def _dias(desde: str | None) -> int:
    """Quantos dias desde uma data ISO. Sem data, um número grande."""
    if not desde:
        return 9999
    try:
        return (date.today() - date.fromisoformat(desde[:10])).days
    except ValueError:
        return 9999


def carregar(db: Session, user: User, limite: int = 60, todas: bool = False) -> list[Palavra]:
    """
    O vocabulário em ordem de prioridade: quem tropeçou primeiro, depois quem
    está sumido há mais tempo. 	odas inclui as palavras de função (you, how,
    to...), que a conversa deixa de fora mas a lista da pessoa precisa mostrar.
    """
    linhas = db.scalars(
        select(Record).where(
            Record.user_id == user.id,
            Record.kind == "content",
            Record.record_id.like("words:%"),
            Record.deleted.is_(False),
        )
    ).all()

    historico = db.scalars(
        select(Record).where(
            Record.user_id == user.id,
            Record.kind == "history",
            Record.deleted.is_(False),
        )
    ).all()

    # por palavra: a última data vista e se houve tropeço recente
    visto: dict[str, str] = {}
    tropecou: set[str] = set()
    for h in historico:
        dados = h.data or {}
        ref = str(dados.get("ref") or "")
        quando = str(dados.get("date") or "")
        if not ref:
            continue
        if quando > visto.get(ref, ""):
            visto[ref] = quando
        if dados.get("event") in TROPECOS:
            tropecou.add(ref)

    palavras: list[Palavra] = []
    for linha in linhas:
        dados = linha.data or {}
        en = str(dados.get("word") or "").strip()
        pt = _traducao(dados)
        if not en or not pt:
            continue  # sem tradução não dá para mostrar o balão
        if not todas and not _cabe_na_conversa(en, str(dados.get("type") or "")):
            continue
        ref = "word:" + linha.record_id.split(":", 1)[1]
        peso = min(_dias(visto.get(ref)), 365) + (500 if ref in tropecou else 0)
        palavras.append(Palavra(id=linha.record_id, en=en, pt=pt, peso=float(peso)))

    palavras.sort(key=lambda p: p.peso, reverse=True)
    return palavras[:limite]
