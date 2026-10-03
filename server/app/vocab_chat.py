"""
Vocabulário pelo chat: adicionar palavras e conferir se uma palavra está na lista.

No histórico, a pessoa pediu "coloque na minha lista a palavra Hi e Hello" e o modelo
respondeu "Sim, agora tem!" sem ter feito nada. Aqui o pedido é atendido de verdade:
a palavra vira um registro de conteúdo do usuário ("words:<id>"), no mesmo formato que
o app grava quando a pessoa anota uma palavra, e chega aos aparelhos na sincronização.

A tradução vem de um glossário de palavras comuns ou de quem pede ("adicione dog =
cachorro"); sem tradução, o chat pergunta em vez de inventar.
"""

import random
import re
import string
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Record, User
from .vocabulario import carregar

ACAO = r"(?:adicion|acrescent|inclu|coloc|coloq|bot[ae]|ponh|p[oõ]e|cadastr|salv|grav|anot)\w*"
PEDIDO = re.compile(
    rf"\b{ACAO}\b.*\b(?:lista|vocabul\w*|palavras?)\b|\b(?:lista|vocabul\w*)\b.*\b{ACAO}\b"
    rf"|^\s*(?:por favor,?\s+)?{ACAO}\s+[\"“']?[A-Za-z]+\b|\b{ACAO}\b.*\w\s*=\s*\w",
    re.IGNORECASE,
)
TEM = re.compile(
    r"\b(?:tem|t[aá]|est[aá]|est[aã]o|existe|h[aá])\b[^?]*\b(?:na|nessa|nesta|no|minha|meu)\s+(?:lista|vocabul\w*)"
    r"|\bj[aá] (?:tenho|tem)\b", re.IGNORECASE)

# palavras do pedido em português que não são o que a pessoa quer adicionar
COMANDO = {
    "coloque", "coloca", "coloquei", "adiciona", "adicione", "adicionar", "acrescenta", "acrescente", "inclui",
    "inclua", "incluir", "bota", "bote", "poe", "ponha", "cadastra", "cadastre", "salva", "salve", "grava", "grave",
    "anota", "anote", "na", "no", "nessa", "nesta", "minha", "meu", "lista", "palavra", "palavras", "vocabulario",
    "a", "as", "o", "os", "e", "tambem", "entao", "por", "favor", "pf", "pfv", "de", "da", "do", "em", "um", "uma",
    "essa", "esta", "isso", "aqui", "agora", "ai", "tem", "ta", "esta", "estao", "ou", "ja", "tenho", "existe", "ha",
    "voce", "vc", "pode", "poderia", "quero", "queria", "consegue", "sim", "nao",
}

GLOSSARIO = {
    "hi": "oi", "hello": "olá", "hey": "ei", "bye": "tchau", "goodbye": "adeus / tchau", "thanks": "obrigado",
    "please": "por favor", "sorry": "desculpa", "welcome": "bem-vindo", "yes": "sim", "no": "não", "okay": "ok",
    "friend": "amigo", "family": "família", "mother": "mãe", "father": "pai", "brother": "irmão", "sister": "irmã",
    "son": "filho", "daughter": "filha", "man": "homem", "woman": "mulher", "child": "criança", "people": "pessoas",
    "house": "casa", "home": "casa / lar", "car": "carro", "city": "cidade", "country": "país", "street": "rua",
    "food": "comida", "water": "água", "coffee": "café", "tea": "chá", "bread": "pão", "book": "livro",
    "school": "escola", "teacher": "professor", "student": "estudante", "job": "emprego", "office": "escritório",
    "company": "empresa", "money": "dinheiro", "time": "tempo / hora", "day": "dia", "night": "noite",
    "morning": "manhã", "afternoon": "tarde", "evening": "noite (começo)", "week": "semana", "month": "mês",
    "year": "ano", "today": "hoje", "tomorrow": "amanhã", "yesterday": "ontem", "now": "agora", "again": "de novo",
    "always": "sempre", "never": "nunca", "happy": "feliz", "sad": "triste", "tired": "cansado", "busy": "ocupado",
    "hungry": "com fome", "good": "bom", "bad": "ruim", "big": "grande", "small": "pequeno", "new": "novo",
    "old": "velho", "beautiful": "bonito", "fast": "rápido", "slow": "devagar", "hot": "quente", "cold": "frio",
    "easy": "fácil", "difficult": "difícil", "love": "amar", "like": "gostar", "want": "querer", "need": "precisar",
    "go": "ir", "come": "vir", "eat": "comer", "drink": "beber", "sleep": "dormir", "study": "estudar",
    "read": "ler", "write": "escrever", "speak": "falar", "listen": "ouvir", "see": "ver", "know": "saber / conhecer",
    "think": "pensar", "have": "ter", "make": "fazer", "take": "pegar / levar", "give": "dar", "help": "ajudar",
    "play": "jogar / tocar", "live": "morar / viver", "buy": "comprar", "open": "abrir", "close": "fechar",
    "start": "começar", "stop": "parar", "learn": "aprender", "understand": "entender", "dog": "cachorro",
    "cat": "gato", "phone": "telefone", "computer": "computador", "music": "música", "movie": "filme",
    "weekend": "fim de semana", "lunch": "almoço", "dinner": "jantar", "breakfast": "café da manhã",
    "who": "quem", "when": "quando", "why": "por que", "which": "qual", "fine": "bem", "great": "ótimo",
    "i": "eu", "me": "me / mim", "he": "ele", "she": "ela", "we": "nós", "they": "eles", "my": "meu / minha",
    "your": "seu / sua", "is": "é / está", "am": "sou / estou", "the": "o / a", "and": "e", "or": "ou",
    "but": "mas", "with": "com", "from": "de", "for": "para / por", "at": "em / no", "in": "em / dentro",
}


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _pares(fala: str) -> dict[str, str]:
    """"dog = cachorro", "dog: cachorro" ou "dog (cachorro)": a tradução que a pessoa deu."""
    pares = {}
    for m in re.finditer(r"\b([A-Za-z][A-Za-z'-]*)\s*(?:=|:|\()\s*([^,;()=]+?)\s*(?:\)|,|;|$| e )", fala):
        pares[m.group(1).lower()] = m.group(2).strip()
    return pares


def palavras_pedidas(fala: str) -> list[str]:
    """As palavras em inglês do pedido (o resto é o comando em português)."""
    pares = _pares(fala)
    # as palavras com tradução dada entram primeiro; a tradução em si não é palavra a adicionar
    texto = fala
    for en, pt in pares.items():
        texto = re.sub(rf"\b{re.escape(en)}\s*(?:=|:|\()\s*{re.escape(pt)}\s*\)?", " ", texto, flags=re.IGNORECASE)
    vistas, out = set(pares), list(pares)
    for bruto in re.findall(r"[\"“']?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)[\"”']?", texto):
        if bruto != _sem_acento(bruto):
            continue  # tem acento: é português
        w = bruto.lower()
        if w in COMANDO or re.fullmatch(ACAO, w) or w in vistas:
            continue
        vistas.add(w)
        out.append(w)
    return out


def _novo_id(palavra: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", palavra.lower()).strip("-")[:32] or "item"
    return f"{base}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}"


def adicionar(db: Session, user: User, en: str, pt: str) -> bool:
    """Grava a palavra como conteúdo do usuário. False se já existia."""
    existentes = {p.en.lower() for p in carregar(db, user, 100000, todas=True)}
    if en.lower() in existentes:
        return False
    item_id = _novo_id(en)
    user.revision += 1
    db.add(Record(
        user_id=user.id, kind="content", record_id=f"words:{item_id}",
        data={
            "id": item_id, "word": en, "type": "palavra", "translations": [{"text": pt}], "core_meaning": pt,
            "uses": [], "variations": [], "related_words": [], "examples": [], "pronunciation": {"ipa": ""},
        },
        revision=user.revision, device="chat",
    ))
    db.commit()
    return True


def responder_vocabulario(db: Session, user: User, conversa: list[dict]) -> str | None:
    """Pedido de adicionar palavra, ou pergunta se uma palavra está na lista. None se não for isso."""
    if not conversa or conversa[-1].get("role") != "user":
        return None
    fala = str(conversa[-1].get("content") or "").strip()

    if PEDIDO.search(fala):
        pedidas = palavras_pedidas(fala)
        if not pedidas:
            return "Qual palavra você quer adicionar? Escreva assim: adicione hello, ou adicione dog = cachorro."
        pares = _pares(fala)
        feitas, ja_tinha, sem_traducao = [], [], []
        for w in pedidas:
            pt = pares.get(w) or GLOSSARIO.get(w)
            if not pt:
                sem_traducao.append(w)
                continue
            (feitas if adicionar(db, user, w, pt) else ja_tinha).append(f"{w} ({pt})")
        partes = []
        if feitas:
            partes.append("Pronto! Adicionei ao seu vocabulário: " + ", ".join(feitas) + ". Elas aparecem no app na próxima sincronização.")
        if ja_tinha:
            partes.append("Já estavam na lista: " + ", ".join(ja_tinha) + ".")
        if sem_traducao:
            exemplo = sem_traducao[0]
            partes.append(
                "Não sei a tradução de " + ", ".join(sem_traducao)
                + f". Me diga assim: adicione {exemplo} = tradução."
            )
        return " ".join(partes)

    if TEM.search(fala):
        pedidas = palavras_pedidas(fala)
        if not pedidas:
            return None
        vocab = {p.en.lower(): p.pt for p in carregar(db, user, 100000, todas=True)}
        tem = [f"{w} ({vocab[w]})" for w in pedidas if w in vocab]
        nao = [w for w in pedidas if w not in vocab]
        partes = []
        if tem:
            partes.append("Sim, está na sua lista: " + ", ".join(tem) + ".")
        if nao:
            partes.append("Não está na lista: " + ", ".join(nao) + ". Quer que eu adicione? É só dizer: adicione " + " e ".join(nao) + ".")
        return " ".join(partes)
    return None