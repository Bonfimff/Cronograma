"""
Troca de palavras marcada pelo modelo.

O modelo escreve só em português e marca, num campo à parte ("trocar"), até duas das
palavras do dia que ficariam naturais em inglês. A saída é restrita por um esquema JSON
(o Ollama garante o formato), então ele não escapa para o inglês dentro da frase e não
inventa palavra fora da lista. Quem troca no texto é este módulo.

Por que assim: pedir ao modelo pequeno que escreva o inglês por conta própria quase nunca
funciona (nos testes, a palavra ofertada saiu em 0 de 60 respostas). Marcar qual palavra em
português soaria natural em inglês é uma decisão bem mais simples, e o Llama 3.2 3B acertou
em 44% a 62% das respostas, com lista de 6 palavras girando a cada turno.

O que o modelo erra de forma teimosa é resolvido aqui, por código, e não por pedido:
- o histórico é saneado antes de ir ao modelo (respostas antigas que prometiam "gravar
  definitivamente" fariam ele repetir a promessa);
- `minimo_trocas`: se o modelo marcou menos palavras que o mínimo, o servidor troca uma
  palavra do dia que já esteja no texto (forçar pelo esquema quebrava a resposta);
- aberturas vazias ("Entendi!", "Peço desculpas...") são cortadas;
- a geração é repetida, uma vez, se a resposta veio em inglês, recitou a lista, prometeu uma
  memória que o chat não tem, repetiu a pergunta anterior ou devolveu a frase da pessoa.
"""

import json
import re
import urllib.request
from typing import Any

from .idioma import parece_portugues
from .usar_vocabulario import usar_vocabulario

# palavras do dia por resposta: mais que isso faz o modelo se perder
QUANTAS = 6

# Em inglês de propósito: um modelo pequeno obedece melhor a comandos em inglês, mesmo
# quando o que se pede é uma resposta em português.
REGRAS = """You are "Amigo de treino", a friendly Brazilian friend inside an English-study app, chatting by text message.

RULE 1, above everything else: write every reply in Brazilian Portuguese. Even when the
other person writes in English, you answer in Portuguese.

RULE 2: keep it short, two sentences at most, like a text message (three if the person
asks about the app).

RULE 3: react like a friend: give an opinion, a related thought or a short answer. Never
repeat the person's sentence back to them. Never start with "Entendi", "Peço desculpas" or
a summary of what they said. Ask a short question only when it really fits, and never
repeat a question you already asked.

RULE 4: you are a friend, not an assistant and not a teacher. Never offer help, never
teach, never correct the other person, never explain a word.

RULE 5: tell the truth about what you are. You are a small AI that only sees this
conversation. You cannot remember anything once the history is cleared, you cannot save or
learn anything permanently, add words to the vocabulary, change settings, or look anything up
(weather, news, time). If asked, say so plainly in one sentence and move on. Never offer to
check something."""

SOBRE_O_APP = """

APP NOTES: you live inside the app these notes describe. When the person asks about it
(screens, games, review, backup, their own progress or plan), answer plainly in Portuguese
using ONLY these notes. This is the one exception to rule 4. If the answer is not in the
notes, say you do not know and stop there: never suggest where to look, because screens that
are not in the notes do not exist. Never invent a feature, a screen or where an option is.

{notas}"""

COM_PALAVRAS = """

TODAY'S WORDS, written in Portuguese inside your sentence: {lista}.
Try to use one of these words in your reply whenever it fits. In the field "trocar", list up
to 2 of the words you used that Brazilians would naturally say in English. If none sounds
natural, leave "trocar" empty. Never list the words as a reply."""

SEM_PALAVRAS = """

The person has not studied any word yet: write in Portuguese only. Leave "trocar" empty."""

LEMBRETE = """

Your previous reply was rejected. Write in Portuguese, do not list the words, do not repeat a question, do not repeat what the person said, and do not promise to remember or save anything."""

# o que entra no histórico no lugar de uma resposta antiga que prometia memória
HONESTA = "Eu só vejo esta conversa e não gravo nada de forma permanente."


def escolhidas(palavras: list, quantas: int = QUANTAS) -> list:
    """As primeiras palavras com tradução distinta: duas fichas podem ter o mesmo texto em português."""
    vistas: set[str] = set()
    saida = []
    for p in palavras:
        chave = p.pt.strip().lower()
        if chave and chave not in vistas:
            vistas.add(chave)
            saida.append(p)
        if len(saida) == quantas:
            break
    return saida


def instrucao(palavras: list, lembrete: bool = False, sobre_o_app: str = "") -> str:
    """
    A ordem importa para o cache do modelo: o que muda a cada resposta (as palavras do dia)
    vai por último, depois do que quase nunca muda (regras e notas do app).
    """
    sel = escolhidas(palavras)
    corpo = REGRAS + (SOBRE_O_APP.format(notas=sobre_o_app) if sobre_o_app else "")
    corpo += COM_PALAVRAS.format(lista=", ".join(p.pt.strip() for p in sel)) if sel else SEM_PALAVRAS
    return corpo + LEMBRETE if lembrete else corpo


def esquema(palavras: list) -> dict:
    """O que o Ollama aceita como resposta: o texto, e até duas palavras, só das do dia."""
    enum = [p.pt.strip() for p in escolhidas(palavras)]
    itens = {"type": "string", "enum": enum} if enum else {"type": "string"}
    return {
        "type": "object",
        "properties": {
            "reply": {"type": "string"},
            "trocar": {"type": "array", "maxItems": 2 if enum else 0, "items": itens},
        },
        "required": ["reply", "trocar"],
    }


def aplicar_troca(reply: str, trocar: list[str], palavras: list) -> tuple[str, list[str]]:
    """Troca no texto, uma vez cada, as palavras marcadas. Devolve o texto e as que de fato trocou."""
    # em empate de tradução, vale a ficha mais urgente (a primeira da lista)
    mapa = {p.pt.strip().lower(): p.en for p in reversed(palavras)}
    final, feitas = reply, []
    for w in trocar:
        achou = re.search(r"\b" + re.escape(w) + r"\b", final, re.IGNORECASE)
        if achou and w.lower() in mapa:
            en = mapa[w.lower()]
            if achou.group(0)[0].isupper():  # a palavra abria a frase: o inglês também ("How", "You")
                en = en[0].upper() + en[1:]
            final = final[: achou.start()] + en + final[achou.end():]
            feitas.append(w)
    return final, feitas


def completar_trocas(texto: str, feitas: list[str], palavras: list, minimo: int) -> tuple[str, list[str]]:
    """
    Se o modelo marcou menos palavras que o mínimo, troca uma palavra do dia que já esteja no
    texto, na ordem de urgência. Se nenhuma estiver, deixa como está: forçar quebra a frase.
    """
    feitas = list(feitas)
    for p in escolhidas(palavras):
        if len(feitas) >= minimo:
            break
        if p.pt.strip() in feitas:
            continue
        texto, novas = aplicar_troca(texto, [p.pt.strip()], palavras)
        feitas += novas
    return texto, feitas


def varrer_vocabulario(texto: str, feitas: list[str], palavras: list, maximo: int) -> tuple[str, list[str]]:
    """
    Consulta o vocabulário inteiro da pessoa: toda palavra dele que aparece em português no
    texto vira inglês, na ordem de urgência, até `maximo` trocas no total. Palavras de até 2
    letras ficam de fora (casam por acaso) e uma ficha não troca duas vezes.
    """
    feitas = list(feitas)
    for p in palavras:
        if len(feitas) >= maximo:
            break
        pt = p.pt.strip()
        if len(pt) < 3 or pt.lower() in (f.lower() for f in feitas):
            continue
        novo, novas = aplicar_troca(texto, [pt], palavras)
        if novas and _ingles_colado(novo, p.en, palavras):
            continue  # "Felipe é um name work": duas trocas lado a lado viram frase sem sentido
        texto, feitas = novo, feitas + novas
    return texto, feitas


def _ingles_colado(texto: str, en: str, palavras: list) -> bool:
    """A palavra recém-trocada ficou encostada em outra palavra do vocabulário em inglês?"""
    outras = {x.en.lower() for x in palavras if x.en.lower() != en.lower()}
    for m in re.finditer(r"\b" + re.escape(en) + r"\b", texto, re.IGNORECASE):
        antes = re.findall(r"[A-Za-zÀ-ÿ']+", texto[: m.start()])[-1:]
        depois = re.findall(r"[A-Za-zÀ-ÿ']+", texto[m.end():])[:1]
        if any(w.lower() in outras for w in antes + depois):
            return True
    return False


ABERTURA_VAZIA = re.compile(r"^\s*(?:(?:Entendi|Peço desculpas[^.!?]*|Desculpe[^.!?]*)\s*[!.]\s*)+", re.IGNORECASE)


def limpar_abertura(texto: str) -> str:
    """Corta "Entendi!" e "Peço desculpas pelo erro!" do começo, quando sobra resposta."""
    sem = ABERTURA_VAZIA.sub("", texto, count=1).strip()
    if len(sem) < 3 or sem == texto.strip():
        return texto
    return sem[0].upper() + sem[1:]


def lista_despejada(texto: str, palavras: list, minimo: int = 3) -> bool:
    """O modelo recitou o vocabulário em vez de conversar."""
    baixo = texto.lower()
    achadas = sum(
        1
        for p in escolhidas(palavras)
        if re.search(r"\b(" + re.escape(p.pt.strip().lower()) + "|" + re.escape(p.en.strip().lower()) + r")\b", baixo)
    )
    return achadas >= minimo


def _palavras_de(texto: str) -> set[str]:
    return set(re.findall(r"[a-zà-ÿ]+", texto.lower()))


def _frases(texto: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?…])\s+", texto.strip()) if s.strip()]


def pergunta_repetida(texto: str, anteriores: list[str]) -> bool:
    """A última frase repete (75% das palavras) a de uma resposta anterior."""
    frases = _frases(texto)
    a = _palavras_de(frases[-1]) if frases else set()
    for antes in anteriores:
        f = _frases(antes)
        b = _palavras_de(f[-1]) if f else set()
        if a and b and len(a & b) / len(a | b) >= 0.75:
            return True
    return False


def eco_do_usuario(texto: str, fala_da_pessoa: str) -> bool:
    """A primeira frase da resposta só devolve o que a pessoa disse ("Você é o desenvolvedor...")."""
    frases = _frases(texto)
    a = _palavras_de(frases[0]) if frases else set()
    b = _palavras_de(fala_da_pessoa)
    return len(a) >= 4 and len(b) >= 4 and len(a & b) / len(a | b) >= 0.5


PROMETE_MEMORIA = re.compile(
    r"definitiv|base de conhecimento|gravad[oa]|gravei|armazenad[oa]|vou (?:tentar )?(?:me )?lembrar|"
    r"lembrar (?:de )?tudo|vou guardar|guardei|salvei|ficar[áa] salv|"
    # adicionar palavras é feito antes do modelo (vocab_chat.py): se o modelo diz que fez, é invenção
    r"adicionei|coloquei|acrescentei|inclu[ií]\b|cadastrei|agora (?:tem|t[aá]|est[aá])\b|est[aá] na (?:sua )?lista",
    re.IGNORECASE,
)


def promete_memoria(texto: str) -> bool:
    """O chat não grava nada além do histórico da tela; dizer que gravou é mentira."""
    return bool(PROMETE_MEMORIA.search(texto))


# só marcas que não aparecem em conversa normal em português ("trocar" é um verbo comum: fora)
VAZOU = re.compile(r"\bRULES?\b|APP NOTES|TODAY'S WORDS|\"trocar\"", re.IGNORECASE)


def vazou_a_instrucao(texto: str) -> bool:
    """O modelo citou a própria instrução ("com base nos Rule 1 a 5")."""
    return bool(VAZOU.search(texto))


# Quantas falas do histórico vão ao modelo. Um 3B não aproveita conversa longa, e cada fala a mais
# é prompt a reler: com 40 falas a resposta chegou a levar mais de um minuto.
MAX_HISTORICO = 12


def sanear_historico(historico: list[dict]) -> list[dict]:
    """
    O histórico vem do aplicativo e guarda tudo o que o amigo já disse, inclusive promessas de
    memória que ele não pode cumprir. Se elas voltam ao modelo, ele as imita. Aqui elas viram
    uma frase verdadeira, só no que vai ao modelo; o que aparece na tela não muda.
    """
    return [
        {**m, "content": HONESTA} if m["role"] == "assistant" and promete_memoria(m["content"]) else m
        for m in historico
    ]


def _ler_json(bruto: str) -> dict:
    """
    Lê o JSON do modelo, mesmo quando ele chega quebrado. Acontece de duas formas:
    - o texto traz um escape inválido ("\\u" sem os quatro dígitos);
    - o modelo escreve os acentos como \\u00e9 (4 a 5 tokens cada), estoura o limite de geração e o
      JSON é cortado no meio de um escape, sem nem chegar ao campo "trocar".
    Em vez de devolver erro para a pessoa, recupera o texto (até a última frase completa, se foi
    cortado) e a lista de trocas; só lixo de verdade continua sendo erro.
    """
    try:
        return json.loads(bruto)
    except json.JSONDecodeError:
        completo = re.search(r'"reply"\s*:\s*"(.*?)"\s*,\s*"trocar"\s*:\s*(\[[^\]]*\])', bruto, re.DOTALL)
        if completo:
            texto, trocar_bruto = completo.group(1), completo.group(2)
        else:
            cortado = re.search(r'"reply"\s*:\s*"(.*)', bruto, re.DOTALL)
            if not cortado:
                raise
            texto = cortado.group(1).rstrip('"}], \n')
            texto = re.sub(r"\\u[0-9a-fA-F]{0,3}$|\\$", "", texto)  # escape cortado no meio
            ultima = max(texto.rfind(c) for c in ".!?")
            if ultima >= 20:  # corta na última frase inteira: melhor curta do que pela metade
                texto = texto[: ultima + 1]
            trocar_bruto = "[]"
        texto = re.sub(r"\\u(?![0-9a-fA-F]{4})", "u", texto)
        try:
            reply = json.loads('"' + texto + '"')
        except json.JSONDecodeError:
            reply = texto.replace('\\"', '"').replace("\\n", " ")
        try:
            trocar = json.loads(trocar_bruto)
        except json.JSONDecodeError:
            trocar = []
        return {"reply": reply, "trocar": trocar}


def _chamar(url: str, modelo: str, sistema: str, historico: list[dict], palavras: list,
            limite: int, temperatura: float, seed: int | None, timeout: int) -> tuple[str, list[str]]:
    corpo: dict[str, Any] = {
        "model": modelo,
        "stream": False,
        "format": esquema(palavras),
        "messages": [{"role": "system", "content": sistema}] + historico,
        # o JSON precisa caber inteiro, e o modelo escreve acentos como é (vários tokens cada):
        # com limite curto ele chegava cortado. Respostas normais usam 30 a 80 tokens; a folga só custa
        # quando o modelo se perde.
        "options": {"num_predict": max(limite, 320), "temperature": temperatura},
    }
    if seed is not None:
        corpo["options"]["seed"] = seed
    req = urllib.request.Request(
        f"{url}/api/chat",
        data=json.dumps(corpo, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        dados = _ler_json(json.loads(r.read().decode("utf-8"))["message"]["content"])
    return dados["reply"].strip(), [str(w) for w in dados.get("trocar", [])]


def responder(url: str, modelo: str, historico: list[dict], palavras: list, limite: int = 200,
              timeout: int = 300, tentativas: int = 1, seed: int | None = None,
              sobre_o_app: str = "", minimo_trocas: int = 0, maximo_trocas: int = 0,
              vocab_completo: list | None = None) -> dict:
    """
    Pede a resposta ao modelo, confere e troca as palavras marcadas.

    `historico` são as falas user/assistant, sem a instrução. Devolve
    {"texto", "trocadas", "tentativas", "problema"}; `problema` fica preenchido só se, mesmo
    depois de pedir de novo, a resposta continuou com algum dos defeitos descritos no topo.
    """
    historico = sanear_historico(historico)[-MAX_HISTORICO:]
    while historico and historico[0]["role"] == "assistant":  # a janela tem de começar numa fala da pessoa
        historico = historico[1:]
    anteriores = [m["content"] for m in historico if m["role"] == "assistant"]
    ultima_da_pessoa = next((m["content"] for m in reversed(historico) if m["role"] == "user"), "")
    problema = None
    reply, trocar, usadas = "", [], 0
    for t in range(tentativas + 1):
        usadas = t + 1
        reply, trocar = _chamar(
            url, modelo, instrucao(palavras, t > 0, sobre_o_app), historico, palavras, limite,
            0.3 + 0.2 * t, None if seed is None else seed + t, timeout,
        )
        if reply and not parece_portugues(reply):
            problema = "ingles"
        elif lista_despejada(reply, palavras):
            problema = "lista"
        elif promete_memoria(reply):
            problema = "memoria"
        elif vazou_a_instrucao(reply):
            problema = "vazou"
        elif pergunta_repetida(reply, anteriores):
            problema = "repetida"
        elif eco_do_usuario(reply, ultima_da_pessoa):
            problema = "eco"
        else:
            problema = None
            break
    if vocab_completo is not None:
        # todas as palavras do vocabulário que couberem, por regras (ver usar_vocabulario.py);
        # o texto volta já marcado, com as palavras vivas no lugar exato
        limpo = limpar_abertura(reply)
        marcado, inglesas = usar_vocabulario(limpo, vocab_completo, marcas=True) if problema is None else (limpo, [])
        return {"texto": marcado.replace("[[", "").replace("]]", ""), "marcado": marcado, "trocadas": inglesas,
                "tentativas": usadas, "problema": problema}
    texto, feitas = aplicar_troca(reply, trocar, palavras)
    if minimo_trocas > 0 and problema is None:
        texto, feitas = completar_trocas(texto, feitas, palavras, minimo_trocas)
    if maximo_trocas > 0 and problema is None:
        texto, feitas = varrer_vocabulario(texto, feitas, palavras, maximo_trocas)
    return {"texto": limpar_abertura(texto), "trocadas": feitas, "tentativas": usadas, "problema": problema}
