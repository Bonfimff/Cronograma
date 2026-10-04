"""
O que o amigo do chat sabe sobre o app e sobre quem está conversando.

O modelo não conhece o Inglês Híbrido: tudo o que ele puder dizer sobre telas, jogos, revisão
ou backup vem daqui. Por isso o guia é curto e só afirma o que o app de fato faz. Ao mudar uma
tela no aplicativo, mude a linha correspondente em GUIA: o modelo vai repetir o que estiver
escrito, certo ou errado.

A parte dinâmica (`resumo`) vem do banco do usuário: quantas palavras ele estuda, quantas
estão pedindo revisão, quando estudou pela última vez, o plano de hoje e os recordes dos jogos.
"""

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Record, User
from .vocabulario import carregar

GUIA = """O app se chama Eita (o título na tela é Inglês Híbrido): estudo de inglês em ciclo app, folha impressa e app de novo, ligado por QR Code. Foi desenvolvido pela Exksvol Systems; o responsável pelo projeto e principal desenvolvedor é Felipe Bonfim Flausino. A conta é opcional: quem não cria conta usa tudo, menos este chat. A conta serve só para sincronizar entre aparelhos e para conversar aqui. O app tem tema claro e escuro.

O app tem exatamente o que está descrito aqui e nada além disso. Se perguntarem por algo que não está descrito, a resposta é que o app não tem isso.

São exatamente cinco telas na barra de baixo:
- Hoje: o plano do dia (tema e objetivo), os próximos dias e as folhas marcadas.
- Semana: o planejamento dos 7 dias. Em Montar semana dá para importar um arquivo JSON, baixar o modelo e exportar a semana. Também gera a folha semanal para imprimir.
- Revisão: monta uma sessão de revisão com os conteúdos que você escolher. Os estados são: Ainda não revisado, Precisa revisar, Precisa reforçar, Em dia e Consolidado. A revisão é espaçada: volta em 1, 3, 7, 14 e 30 dias.
- Conteúdo: a Biblioteca, com Palavra, Expressão, Padrão, Gramática e Tema, cada um com exemplos e histórico. Toque numa palavra para ouvir a pronúncia e ver a tradução.
- Jogos: são exatamente quatro, Tetris, Ligar palavras, Cruzadas e Flashcards. Não há outros jogos.

Aula guiada: Entender, Observar, Relacionar, Praticar e Avaliar. Também dá para Ler aula em texto corrido. As folhas impressas têm QR Code: a câmera lê o código e as caixas marcadas e leva de volta à sessão.

No menu do avatar: Meu progresso (o que já gruda, o que ainda escapa e com que frequência você estuda), Ajustes (vozes e velocidade da leitura em voz alta) e a conta. Para fazer backup: menu do avatar, depois Ajustes, depois Backup dos dados; o backup leva também os recordes dos jogos.

Este chat é o Amigo de treino: conversa em português e troca por inglês, no meio da fala, palavras do vocabulário que você já estudou. Ele só enxerga a conversa que está na tela: o botão Limpar histórico apaga tudo e ele esquece. Ele não grava nada de forma permanente, consegue adicionar palavras ao vocabulário quando a pessoa pede (por exemplo: adicione hello), mas não muda configurações pelo chat, e consulta de verdade a hora e a data de Brasília, a previsão do tempo de qualquer cidade e a Wikipédia (curiosidades e o que é ou quem foi algo). Ele é uma IA pequena que roda no computador do desenvolvedor."""

# recordes que o app guarda como registros do tipo "game" (ver src/core/storage/backup.ts)
RECORDES = {
    "word-tetris-best": "Tetris",
    "word-match-best-streak": "Ligar palavras (maior sequência)",
}

# Palavras que indicam pergunta sobre o app. Escolhidas a dedo: "hoje", "conta" e "semana" soltas
# aparecem em qualquer bate-papo ("Hoje foi corrido", "Me conta uma novidade") e ligariam o guia à toa.
SOBRE_O_APP = re.compile(
    r"\b(app|aplicativo|eita|aba|abas|tela|telas|menu|avatar|jogos?|tetris|flashcards?|cruzadas|ligar palavras|"
    r"revis(?:ão|ao|ar|ões)|backup|ajustes|progresso|biblioteca|conteúdo|folhas?|qr|aula|aulas|sess(?:ão|ões)|"
    r"plano do dia|meu plano|modo escuro|tema escuro|tema claro|funcionalidades?|recorde|vocabulário|vocabulario|"
    r"(?:quantas|quais) palavras|minha conta|criar conta|sem conta|montar semana|amigo de treino|"
    r"limpar (?:o )?histórico|quem (?:criou|fez|desenvolveu)|criador|desenvolvedor)\b",
    re.IGNORECASE,
)

# pedir a lista de palavras: aí vale gastar contexto listando-as
VOCABULARIO = re.compile(
    r"\b(vocabul[aá]rio|minhas palavras|palavras (?:que )?(?:eu )?(?:tenho|estudo|salvas?)|quais palavras|lista de palavras)\b",
    re.IGNORECASE,
)


def _falas_dela(conversa: list[dict], quantas: int = 2) -> list[str]:
    return [m["content"] for m in conversa if m["role"] == "user"][-quantas:]


def pergunta_sobre_o_app(conversa: list[dict]) -> bool:
    """
    A pessoa está perguntando do app? Olha as duas últimas falas dela, para a pergunta de
    seguimento ("e o Tetris?" depois de "o que tem nos jogos?") não perder o guia.

    O guia só entra quando serve: com ele em toda conversa, o bate-papo normal piorou (nos testes,
    a troca de palavras caiu pela metade e o modelo passou a recitar listas).
    """
    return any(SOBRE_O_APP.search(t) for t in _falas_dela(conversa))


def pergunta_sobre_vocabulario(conversa: list[dict]) -> bool:
    return any(VOCABULARIO.search(t) for t in _falas_dela(conversa, 1))


def _dias_desde(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        return (date.today() - date.fromisoformat(iso[:10])).days
    except ValueError:
        return None


def _plano(db: Session, user: User) -> tuple[str, str, list[str]]:
    """O tema e o objetivo de hoje (registros `week`) e as sessões do dia (registros `session`)."""
    hoje = date.today().isoformat()
    tema = objetivo = ""
    for r in db.scalars(select(Record).where(Record.user_id == user.id, Record.kind == "week", Record.deleted.is_(False))):
        for dia in (r.data or {}).get("days") or []:
            if isinstance(dia, dict) and dia.get("date") == hoje:
                tema, objetivo = str(dia.get("theme") or "").strip(), str(dia.get("objective") or "").strip()
    sessoes = []
    for r in db.scalars(select(Record).where(Record.user_id == user.id, Record.kind == "session", Record.deleted.is_(False))):
        d = r.data or {}
        if d.get("date") == hoje and d.get("title"):
            sessoes.append(f"{d['title']} ({'feita' if d.get('finishedAt') else 'a fazer'})")
    return tema, objetivo, sessoes


def _plano_de_hoje(db: Session, user: User) -> str:
    tema, objetivo, sessoes = _plano(db, user)
    partes = []
    if tema:
        partes.append(f"tema de hoje: {tema}" + (f", objetivo: {objetivo}" if objetivo else ""))
    if sessoes:
        partes.append("sessões de hoje: " + "; ".join(sessoes))
    return "; ".join(partes)


def _recordes(db: Session, user: User) -> list[str]:
    saida = []
    for r in db.scalars(select(Record).where(Record.user_id == user.id, Record.kind == "game", Record.deleted.is_(False))):
        nome = RECORDES.get(r.record_id)
        valor = str((r.data or {}).get("value") or "").strip()
        if nome and valor:
            saida.append(f"{nome} {valor}")
    return saida


def resumo(db: Session, user: User, listar_vocabulario: bool = False) -> str:
    """Uma linha sobre a pessoa: o que ela estuda e como vai. Vazia se não houver nada a dizer."""
    palavras = carregar(db, user, limite=100000, todas=True)
    partes: list[str] = []
    if palavras:
        # carregar() soma 500 ao peso de quem tropeçou; sem tropeço o peso nunca passa de 365
        pedindo = sum(1 for p in palavras if p.peso >= 500)
        partes.append(f"{len(palavras)} palavras no vocabulário, {pedindo} pedindo revisão")
        if listar_vocabulario:
            lista = "; ".join(f"{p.en} ({p.pt})" for p in palavras[:20])
            partes.append(f"vocabulário, das mais urgentes para as menos (até 20): {lista}")

    plano = _plano_de_hoje(db, user)
    if plano:
        partes.append(plano)

    datas = [
        str((r.data or {}).get("date") or "")
        for r in db.scalars(
            select(Record).where(Record.user_id == user.id, Record.kind == "history", Record.deleted.is_(False))
        )
    ]
    dias = _dias_desde(max(datas, default=None) or None)
    if dias is not None:
        partes.append("estudou hoje" if dias == 0 else f"último estudo há {dias} dia(s)")

    recordes = _recordes(db, user)
    if recordes:
        partes.append("recordes: " + "; ".join(recordes))

    return ("Sobre esta pessoa (só use se perguntarem): " + "; ".join(partes) + ".") if partes else ""


# --- respostas diretas ----------------------------------------------------------------------------
# Perguntas em que o modelo pequeno erra de forma teimosa (nos testes e no uso real: jurava ter
# "gravado definitivamente" o que a pessoa disse, não sabia o próprio nome nem quem fez o app) e em
# que errar é pior do que responder seco. A resposta sai daqui, sem passar pelo modelo.
_MEM = r"(?:grav|salv|guard|lembr|esquec|aprend|adicion)"
_PERM = r"(?:definitiv|permanent|para sempre)"
FIXAS: list[tuple[re.Pattern, str]] = [
    (re.compile(rf"{_MEM}\w*[^.?!]*{_PERM}|{_PERM}[^.?!]*{_MEM}|limpar (?:o )?hist[oó]rico|"
                r"(?:vc|voc[eê]) (?:vai )?esquecer|j[aá] foi gravad", re.I),
     "Eu só enxergo a conversa que está na tela. Se você limpar o histórico, eu esqueço tudo, e não consigo gravar nada de forma permanente."),
    (re.compile(r"outros usu[aá]rios|compartilh", re.I),
     "Eu só vejo esta conversa e não tenho como passar o que você diz para outras pessoas."),

    (re.compile(r"modelo de linguagem|qual (?:é )?o seu modelo", re.I),
     "Sou uma IA pequena que roda no computador do desenvolvedor. Não sei dizer mais que isso sobre mim."),
    (re.compile(r"como (?:vc|voc[eê]) se chama|(?:qual|quem) (?:é )?(?:o )?seu nome|seu nome", re.I),
     "Eu sou o Amigo de treino, o chat do app Eita."),
    (re.compile(r"quem (?:foi |é )?(?:o )?(?:criou|criador|fez|desenvolveu|desenvolvedor|respons[aá]vel)", re.I),
     "O Eita foi desenvolvido pela Exksvol Systems. O responsável pelo projeto e principal desenvolvedor é Felipe Bonfim Flausino."),
    (re.compile(r"(?:quais|que) (?:s[aã]o )?(?:os )?jogos|jogos (?:que )?(?:tem|h[aá]|existem)|o que tem (?:na|em) (?:aba )?jogos", re.I),
     "O app tem quatro jogos: Tetris, Ligar palavras, Cruzadas e Flashcards."),
    (re.compile(r"\bbackup\b", re.I),
     "Para fazer backup: menu do avatar, depois Ajustes, depois Backup dos dados. O backup leva também os recordes dos jogos."),
]
PLANO = re.compile(
    r"(?:tema|plano|aula|sess[aã]o|sess[oõ]es)[^.?!]*\b(?:hoje|hj|do dia)\b|\b(?:hoje|hj)\b[^.?!]*(?:tema|plano|aula|sess[aã]o)", re.I)
LISTA = re.compile(
    r"lista de vocabul|minhas palavras|quais palavras|quantas palavras|vocabul[aá]rio\s*\??\s*$"
    r"|(?:qual|quais|como|mostr\w*|ver|veja)\b[^?]*\b(?:meu|o meu|minha|a minha|a)\s+(?:vocabul|lista)\b", re.I)
RECORDE = re.compile(r"recorde|melhor pontua", re.I)


def resposta_direta(db: Session, user: User, conversa: list[dict]) -> str | None:
    """A resposta pronta para o que a pessoa acabou de perguntar, ou None se for conversa para o modelo."""
    fala = (_falas_dela(conversa, 1) or [""])[0]
    for padrao, resposta in FIXAS:
        if padrao.search(fala):
            return resposta
    if PLANO.search(fala):
        tema, objetivo, sessoes = _plano(db, user)
        if not (tema or sessoes):
            return "Não achei um plano para hoje no app."
        partes = [f"Hoje o tema é {tema}" + (f": {objetivo}." if objetivo else ".")] if tema else []
        if sessoes:
            partes.append("Sessões de hoje: " + "; ".join(sessoes) + ".")
        return " ".join(partes)
    if LISTA.search(fala):
        palavras = carregar(db, user, limite=100000, todas=True)
        vistas: set[str] = set()
        palavras = [p for p in palavras if not (p.en.lower() in vistas or vistas.add(p.en.lower()))]
        if not palavras:
            return "Você ainda não tem palavras no vocabulário."
        lista = "\n".join(f"• {p.en} ({p.pt})" for p in palavras[:30])
        if len(palavras) <= 30:
            return f"Você tem {len(palavras)} palavras no vocabulário:\n{lista}"
        return f"Você tem {len(palavras)} palavras no vocabulário. As 30 que mais pedem atenção:\n{lista}"
    if RECORDE.search(fala):
        recordes = _recordes(db, user)
        return ("Seus recordes: " + "; ".join(recordes) + ".") if recordes else "Ainda não achei recordes seus nos jogos."
    return None


def contexto_do_app(db: Session, user: User, listar_vocabulario: bool = False) -> str:
    """O guia do app mais o resumo da pessoa, prontos para entrar na instrução do modelo."""
    sobre = resumo(db, user, listar_vocabulario)
    return GUIA + ("\n\n" + sobre if sobre else "")
