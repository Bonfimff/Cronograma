"""Histórico de 05/10: "Bom dia" saía "Good dia". Expressão vem inteira, ou fica em português."""

from app import chat_slot
from app.usar_vocabulario import usar_vocabulario
from app.vocabulario import Palavra

GOOD = Palavra("words:g", "good", "bom", 1)
MORNING = Palavra("words:m", "morning", "manhã", 1)


def test_conhece_as_palavras_usa_a_expressao_e_avisa_para_gravar():
    novas: list = []
    texto, _ = usar_vocabulario("Bom dia! Tudo bom?", [GOOD, MORNING], marcas=True, novas=novas)
    assert texto.startswith("[[Good morning]]!")
    assert novas == [("good morning", "bom dia")]


def test_nao_conhece_fica_em_portugues_nunca_good_dia():
    texto, _ = usar_vocabulario("Bom dia! O livro é bom.", [GOOD], marcas=True)
    assert texto.startswith("Bom dia!") and "Good dia" not in texto
    assert "[[good]]" in texto  # o "bom" sozinho continua trocando


def test_expressao_ja_gravada_nao_vira_nova():
    exp = Palavra("expressions:x", "good morning", "bom dia", 1)
    novas: list = []
    texto, _ = usar_vocabulario("Bom dia!", [GOOD, MORNING, exp], marcas=True, novas=novas)
    assert texto.startswith("[[Good morning]]") and novas == []


def test_chat_grava_a_expressao_nova(client, conta, monkeypatch):
    a = conta()
    client.post("/chat", json={"messages": [{"role": "user", "content": "adicione good e morning"}]}, headers=a.headers)
    monkeypatch.setattr(chat_slot, "_chamar", lambda *x, **k: ("Bom dia! Dormiu bem?", []))
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Oi"}]}, headers=a.headers).json()
    assert "[[Good morning]]" in r["reply"] or "[[good morning]]" in r["reply"].lower()
    r2 = client.post("/chat", json={"messages": [{"role": "user", "content": "Já tem good morning na minha lista?"}]}, headers=a.headers).json()
    assert "Sim, está na sua lista" in r2["reply"]
