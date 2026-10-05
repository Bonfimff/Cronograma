"""
Vocabulário pelo chat: adicionar palavras e expressões, e conferir se estão na lista.

No histórico, a pessoa pediu "coloque na minha lista a palavra Hi e Hello" e o modelo
respondeu "Sim, agora tem!" sem ter feito nada. Aqui o pedido é atendido de verdade: vira
um registro de conteúdo do usuário, no mesmo formato que o app grava, e chega aos aparelhos
na sincronização.

O que o histórico de 04/10 mostrou e esta versão resolve:
- "thank you = obrigado" virava só "you": mais de uma palavra em inglês agora é uma
  EXPRESSÃO ("expressions:<id>"), e o chat passa a usá-la inteira nas respostas;
- "free igual a livre", "a palavra Free = livre da minha lista de vocabulário": o pedido é
  lido sem o "da minha lista…" grudado na tradução;
- o chat perguntava a tradução e a resposta seguinte ("Livre") era ignorada: agora a
  resposta curta completa o pedido que ficou pendente;
- "já tem obrigado na minha lista? se não tiver, adicione": o português também serve, pelo
  glossário (obrigado → thank you).

A tradução vem do que a pessoa escreveu, do glossário de palavras e expressões comuns ou da
resposta à pergunta do chat; sem tradução, o chat pergunta em vez de inventar.
"""

import random
import re
import string
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from .expressoes import EXPRESSOES
from .models import Record, User
from .vocabulario import carregar

ACAO = r"(?:adicion|acrescent|inclu|coloc|coloq|bot[ae]|ponh|p[oõ]e|cadastr|salv|grav|anot)\w*"
PEDIDO = re.compile(
    rf"\b{ACAO}\b.*\b(?:lista|vocabul\w*|palavras?|express\w*)\b|\b(?:lista|vocabul\w*)\b.*\b{ACAO}\b"
    rf"|^\s*(?:por favor,?\s+)?{ACAO}\s+[\"“']?[A-Za-z]+\b|\b{ACAO}\b.*\w\s*(?:=|igual a)\s*\w",
    re.IGNORECASE,
)
TEM = re.compile(
    r"\b(?:tem|t[aá]|est[aá]|est[aã]o|existe|h[aá])\b[^?]*\b(?:na|nessa|nesta|no|minha|meu|da)\s+(?:lista|vocabul\w*)"
    r"|\bj[aá] (?:tenho|tem)\b", re.IGNORECASE)
# "se não tiver, pode adicionar": conferir e, se faltar, adicionar
SE_NAO_TIVER = re.compile(rf"\bse n[aã]o (?:tiver|estiver|tem)\b.*\b{ACAO}|\b{ACAO}\b.*\bse n[aã]o (?:tiver|estiver|tem)\b", re.IGNORECASE)
# o pedaço do fim que não é tradução: "… da/na/a minha lista de vocabulário"
CAUDA = re.compile(
    r"\s*,?\s*(?:(?:a|à|na|da|para a|pra|pro|no|ao|em)\s+)?(?:minha|meu|sua|seu)\s+(?:lista|vocabul\w*)"
    r"(?:\s+de\s+(?:vocabul\w*|palavras))?\s*[.!]*\s*$", re.IGNORECASE)
# a pergunta que o chat faz quando falta a tradução
PERGUNTA_TRADUCAO = re.compile(r"N[aã]o sei a tradu[cç][aã]o de ([^.]+)\.", re.IGNORECASE)

# palavras do pedido em português que não são o que a pessoa quer adicionar
COMANDO = {
    "coloque", "coloca", "coloquei", "adiciona", "adicione", "adicionar", "acrescenta", "acrescente", "inclui",
    "inclua", "incluir", "bota", "bote", "poe", "ponha", "cadastra", "cadastre", "salva", "salve", "grava", "grave",
    "anota", "anote", "na", "no", "nessa", "nesta", "minha", "meu", "lista", "palavra", "palavras", "vocabulario",
    "expressao", "expressoes", "frase",
    "a", "as", "o", "os", "e", "tambem", "entao", "por", "favor", "pf", "pfv", "de", "da", "do", "em", "um", "uma",
    "essa", "esta", "isso", "aqui", "agora", "ai", "tem", "ta", "esta", "estao", "ou", "ja", "tenho", "existe", "ha",
    "voce", "vc", "pode", "poderia", "quero", "queria", "consegue", "sim", "nao", "igual", "se", "tiver", "com",
    "traducao", "significa", "que", "para", "pra", "sua", "seu",
}

GLOSSARIO = {
    "hi": "oi", "hello": "olá", "hey": "ei", "bye": "tchau", "goodbye": "adeus / tchau", "thanks": "obrigado",
    "thank": "agradecer", "please": "por favor", "sorry": "desculpa", "welcome": "bem-vindo", "yes": "sim",
    "no": "não", "okay": "ok", "ok": "ok",
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
    "free": "livre / grátis", "work": "trabalho / trabalhar", "nice": "legal", "meet": "conhecer / encontrar",
    "rest": "descansar", "break": "pausa", "class": "aula", "lesson": "lição", "question": "pergunta",
    "answer": "resposta", "word": "palavra", "english": "inglês", "language": "idioma", "travel": "viajar",
    "trip": "viagem", "talk": "conversar", "call": "ligar", "wait": "esperar", "ready": "pronto",
    "sure": "claro", "maybe": "talvez", "very": "muito", "much": "muito", "little": "pouco", "late": "tarde (atrasado)",
    "early": "cedo", "soon": "logo", "here": "aqui", "there": "lá", "where": "onde", "what": "o que", "how": "como",
    "you": "você", "are": "são / está", "do": "fazer", "today's": "de hoje",
}


# o caminho de volta: obrigado → thank you (só traduções sem barra, para não haver dúvida)
REVERSO = {pt: en for en, pt in {**GLOSSARIO, **EXPRESSOES}.items() if "/" not in pt and "(" not in pt}


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _limpar_traducao(pt: str) -> str:
    """ "obrigado a minha lista de vocabulário" → "obrigado"."""
    return CAUDA.sub("", pt).strip(" .,;:!?\"'“”")


def _pares(fala: str) -> dict[str, str]:
    """
    A tradução que a pessoa deu: "dog = cachorro", "dog: cachorro", "dog (cachorro)",
    "free igual a livre", "thank you = obrigado". O inglês pode ter mais de uma palavra.
    """
    pares = {}
    padrao = (
        r"(?<![A-Za-zÀ-ÿ])([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,4})"
        r"\s*(?:=|:|\(|\bigual\s+a\b|\bque significa\b|\bsignifica\b)\s*"
        r"([^,;()=]+?)\s*(?:\)|,|;|$|\s+e\s+)"
    )
    for m in re.finditer(padrao, fala, re.IGNORECASE):
        en_bruto = m.group(1)
        # tira do começo o que é comando em português ("palavra Free", "adicionar thank you")
        termos = en_bruto.split()
        while termos and (_sem_acento(termos[0]).lower() in COMANDO or re.fullmatch(ACAO, termos[0], re.IGNORECASE)):
            termos = termos[1:]
        if not termos:
            continue
        pt = _limpar_traducao(m.group(2))
        if pt:
            pares[" ".join(termos).lower()] = pt
    return pares


def palavras_pedidas(fala: str) -> list[str]:
    """As palavras e expressões em inglês do pedido (o resto é o comando em português)."""
    pares = _pares(fala)
    texto = fala
    for en, pt in pares.items():
        texto = re.sub(rf"{re.escape(en)}\s*(?:=|:|\(|igual\s+a|que significa|significa)\s*{re.escape(pt)}\s*\)?", " ", texto, flags=re.IGNORECASE)
    vistas, out = set(pares), list(pares)
    # expressões conhecidas primeiro, inteiras ("thank you" não vira "thank" + "you")
    for exp in sorted(EXPRESSOES, key=len, reverse=True):
        m = re.search(rf"(?<![A-Za-z']){re.escape(exp)}(?![A-Za-z'])", texto, re.IGNORECASE)
        if m and exp not in vistas:
            vistas.add(exp)
            out.append(exp)
            texto = texto[: m.start()] + " " + texto[m.end():]
    for bruto in re.findall(r"[\"“']?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)[\"”']?", texto):
        if bruto != _sem_acento(bruto):
            continue  # tem acento: é português
        w = bruto.lower()
        if w in COMANDO or re.fullmatch(ACAO, w) or w in vistas or w in REVERSO:
            continue
        vistas.add(w)
        out.append(w)
    return out


def portugues_pedido(fala: str) -> list[str]:
    """O que a pessoa escreveu em português e o glossário sabe dizer em inglês (obrigado → thank you)."""
    base = _sem_acento(fala.lower())
    achados = []
    for pt in sorted(REVERSO, key=len, reverse=True):
        alvo = _sem_acento(pt.lower())
        if alvo in COMANDO:
            continue  # "não", "sim", "com": fazem parte do pedido, não são o que adicionar
        if len(alvo) >= 3 and re.search(rf"(?<![a-z]){re.escape(alvo)}(?![a-z])", base):
            achados.append(REVERSO[pt])
            base = base.replace(alvo, " ")
    return achados


def _novo_id(palavra: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", palavra.lower()).strip("-")[:32] or "item"
    return f"{base}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=4))}"


def adicionar(db: Session, user: User, en: str, pt: str) -> bool:
    """Grava a palavra (ou a expressão, se tiver espaço) como conteúdo do usuário. False se já existia."""
    existentes = {p.en.lower() for p in carregar(db, user, 100000, todas=True)}
    if en.lower() in existentes:
        return False
    item_id = _novo_id(en)
    user.revision += 1
    if " " in en.strip():
        registro, dados = f"expressions:{item_id}", {
            "id": item_id, "text": en, "translation": pt, "words": [], "context": "", "meaning": pt, "examples": [],
        }
    else:
        registro, dados = f"words:{item_id}", {
            "id": item_id, "word": en, "type": "palavra", "translations": [{"text": pt}], "core_meaning": pt,
            "uses": [], "variations": [], "related_words": [], "examples": [], "pronunciation": {"ipa": ""},
        }
    db.add(Record(user_id=user.id, kind="content", record_id=registro, data=dados, revision=user.revision, device="chat"))
    db.commit()
    return True


def _traducao(w: str, pares: dict[str, str]) -> str | None:
    return pares.get(w) or EXPRESSOES.get(w) or GLOSSARIO.get(w)


def _adicionar_varias(db: Session, user: User, pedidas: list[str], pares: dict[str, str]) -> str:
    feitas, ja_tinha, sem_traducao = [], [], []
    for w in pedidas:
        pt = _traducao(w, pares)
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
        partes.append(
            "Não sei a tradução de " + ", ".join(sem_traducao)
            + ". Responda só com a tradução (ex.: livre) ou escreva: adicione " + sem_traducao[0] + " = tradução."
        )
    return " ".join(partes)


def _pendente(conversa: list[dict]) -> list[str]:
    """A última fala do chat perguntou a tradução de alguma palavra? Devolve as palavras pendentes."""
    anterior = next((m for m in reversed(conversa[:-1]) if m.get("role") == "assistant"), None)
    if not anterior:
        return []
    m = PERGUNTA_TRADUCAO.search(str(anterior.get("content") or "").replace("[[", "").replace("]]", ""))
    return [w.strip().lower() for w in m.group(1).split(",") if w.strip()] if m else []


def responder_vocabulario(db: Session, user: User, conversa: list[dict]) -> str | None:
    """Pedido de adicionar, pergunta se está na lista, ou a tradução que faltava. None se não for isso."""
    if not conversa or conversa[-1].get("role") != "user":
        return None
    fala = str(conversa[-1].get("content") or "").strip()

    # resposta curta à pergunta "não sei a tradução de free": "Livre" completa o pedido
    pendentes = _pendente(conversa)
    if pendentes and not PEDIDO.search(fala) and len(fala.split()) <= 5 and "?" not in fala:
        pt = _limpar_traducao(re.sub(r"^(?:[ée]|significa|quer dizer|a tradu[cç][aã]o [ée])\s+", "", fala, flags=re.IGNORECASE))
        if pt and pt.lower() not in COMANDO:
            return _adicionar_varias(db, user, pendentes[:1], {pendentes[0]: pt})

    quer_adicionar = PEDIDO.search(fala) or SE_NAO_TIVER.search(fala)
    if quer_adicionar and not (TEM.search(fala) and not SE_NAO_TIVER.search(fala)):
        pares = _pares(fala)
        pedidas = palavras_pedidas(fala) or portugues_pedido(fala)
        if not pedidas:
            return "O que você quer adicionar? Escreva assim: adicione hello, adicione dog = cachorro ou adicione thank you = obrigado."
        return _adicionar_varias(db, user, pedidas, pares)

    if TEM.search(fala):
        pedidas = palavras_pedidas(fala) or portugues_pedido(fala)
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
