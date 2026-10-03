"""Treino de conversa: perguntas das frases de estudo, correção gentil, uma pergunta por vez."""

from app.chat_slot import varrer_vocabulario
from app.routers import chat
from app.treino import corrigir
from app.vocabulario import Palavra

PALAVRAS = [
    ("name", "nome"), ("work", "trabalhar"), ("where", "onde"), ("how", "como"),
    ("are", "está"), ("you", "você"), ("You", "Você"), ("nice", "agradável"), ("meet", "conhecer"),
]
FRASES = [
    ("ex-how-are-you", "How are you?", "Como você está?"),
    ("ex-what-do-you-do", "What do you do?", "O que você faz?"),
    ("ex-where-do-you-work", "Where do you work?", "Onde você trabalha?"),
    ("ex-how-is-she", "How is she?", "Como ela está?"),
    ("ex-i-work", "I work at home.", "Eu trabalho em casa."),
]


def _nao_deveria(*_a, **_k):
    raise AssertionError("o treino não chama o modelo")


def _conta_com_conteudo(conta):
    a = conta()
    itens = [{"kind": "content", "id": f"words:{en.lower()}{'2' if en == 'You' else ''}", "data": {"word": en, "translations": [{"text": pt}]}} for en, pt in PALAVRAS]
    itens += [{"kind": "content", "id": f"examples:{i}", "data": {"id": i, "en": en, "pt": pt}} for i, en, pt in FRASES]
    a.push(itens)
    return a


def _falar(client, a, mensagens, marcas=False):
    r = client.post("/chat", json={"messages": [{"role": p, "content": t} for p, t in mensagens]}, headers=a.headers)
    assert r.status_code == 200, r.text
    texto = r.json()["reply"]
    # as palavras vivas vêm entre [[ ]]; para conferir o texto, sem elas
    return texto if marcas else texto.replace("[[", "").replace("]]", "")


def test_corrige_o_que_e_seguro():
    vocab = {"work", "name", "meet", "nice"}
    assert corrigir("May name is Felipe", vocab) == "My name is Felipe"
    assert corrigir("I'm good! End you?", vocab) == "I'm good! And you?"
    assert corrigir("What is your wark?", vocab) == "What is your work?"
    assert corrigir("im fine", vocab) == "I'm fine"
    assert corrigir("Yes", vocab) == "Yes"
    assert corrigir("I work at home.", vocab) == "I work at home."
    assert corrigir("We were happy, thank you.", vocab) == "We were happy, thank you."


def test_treino_completo(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    a = _conta_com_conteudo(conta)
    conversa = [("user", "Yes, vamos treinar uma conversa de apresentação")]
    r1 = _falar(client, a, conversa, marcas=True)
    assert "🎯 Treino 1/4" in r1 and "What is your [[name]]?" in r1 and "(Qual é o seu nome?)" in r1
    assert "How is she" not in r1

    conversa += [("assistant", r1), ("user", "May name is Felipe")]
    r2 = _falar(client, a, conversa)
    assert r2.startswith("Quase! Fica assim: My name is Felipe")
    assert "🎯 Treino 2/4" in r2 and "(Como você está?)" in r2

    conversa += [("assistant", r2), ("user", "I'm fine, thanks.")]
    r3 = _falar(client, a, conversa)
    assert r3.startswith("Muito bem! ✓") and "🎯 Treino 3/4" in r3 and "What do you do?" in r3

    conversa += [("assistant", r3), ("user", "Eu sou professor")]
    r4 = _falar(client, a, conversa)
    assert r4.startswith("Tenta em inglês") and "🎯 Treino 3/4" in r4

    conversa += [("assistant", r4), ("user", "I am a teacher.")]
    r5 = _falar(client, a, conversa)
    assert "🎯 Treino 4/4" in r5 and "Where do you work?" in r5

    conversa += [("assistant", r5), ("user", "I work at home.")]
    r6 = _falar(client, a, conversa)
    assert "Treino concluído" in r6 and "Nice to meet you!" in r6


def test_parar_o_treino(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    a = _conta_com_conteudo(conta)
    r1 = _falar(client, a, [("user", "vamos praticar")])
    r2 = _falar(client, a, [("user", "vamos praticar"), ("assistant", r1), ("user", "quero parar")])
    assert r2.startswith("Treino encerrado")


def test_correcao_fora_do_treino(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", lambda *a, **k: {"texto": "Que bom te conhecer!", "trocadas": [], "tentativas": 1, "problema": None})
    a = _conta_com_conteudo(conta)
    r = _falar(client, a, [("user", "May name is Felipe")])
    assert r.startswith("✎ Em inglês, fica assim: My")
    assert "Que bom te conhecer!" in r


def test_lista_sem_repetidas(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    a = _conta_com_conteudo(conta)
    r = _falar(client, a, [("user", "qual é a minha lista de vocabulário?")], marcas=True)
    assert r.startswith("Você tem 8 palavras no vocabulário:")
    assert r.lower().count("[[you]]") == 1


def test_troca_nao_cola_duas_palavras_em_ingles():
    vocab = [Palavra("words:name", "name", "nome", 9.0), Palavra("words:work", "work", "trabalho", 8.0)]
    texto, feitas = varrer_vocabulario("Felipe é um nome trabalho, legal!", [], vocab, 3)
    assert feitas == ["nome"] and texto == "Felipe é um name trabalho, legal!"