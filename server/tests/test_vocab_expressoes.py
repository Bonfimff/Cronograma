"""Os pedidos do histórico de 04/10 que falharam: expressões, "igual a", cauda grudada, contexto."""

from app import vocab_chat as vc
from app.usar_vocabulario import usar_vocabulario
from app.vocabulario import Palavra


def test_pares_com_expressao_e_cauda():
    assert vc._pares("Adicionar a palavra thank you = obrigado a minha lista de vocabulário") == {"thank you": "obrigado"}
    assert vc._pares("Adicionar a palavra Free igual a livre da minha lista de vocabulário") == {"free": "livre"}
    assert vc._pares("Adicionar à minha lista de vocabulário: free = livre") == {"free": "livre"}
    assert vc._pares("adicione dog = cachorro e cat = gato") == {"dog": "cachorro", "cat": "gato"}


def test_palavras_pedidas():
    assert vc.palavras_pedidas("Adicionar a palavra thank you = obrigado a minha lista de vocabulário") == ["thank you"]
    assert vc.palavras_pedidas("Adicionar free na minha lista de vocabulário") == ["free"]
    assert vc.palavras_pedidas("adiciona good morning e see you") == ["good morning", "see you"]


def test_portugues_vira_ingles():
    assert vc.portugues_pedido("Já tem obrigado da minha lista de vocabulário se não tiver pode adicionar") == ["thank you"]


def _conversa(*falas):
    return [{"role": r, "content": c} for r, c in falas]


def test_rota_adiciona_expressao_e_usa_inteira(client, conta, monkeypatch):
    from app import chat_slot
    a = conta()
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Adicionar a palavra thank you = obrigado a minha lista de vocabulário"}]}, headers=a.headers)
    assert "[[thank you]] (obrigado)" in r.json()["reply"]
    # a expressão volta inteira nas respostas do amigo
    monkeypatch.setattr(chat_slot, "_chamar", lambda *x, **k: ("Muito bem, obrigado por contar!", []))
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Hoje estudei bastante"}]}, headers=a.headers)
    assert "[[thank you]]" in r.json()["reply"]


def test_rota_completa_a_traducao_pendente(client, conta):
    a = conta()
    r1 = client.post("/chat", json={"messages": [{"role": "user", "content": "adicione zorp"}]}, headers=a.headers)
    pergunta = r1.json()["reply"]
    assert "Não sei a tradução de zorp" in pergunta
    r2 = client.post("/chat", json={"messages": [
        {"role": "user", "content": "adicione zorp"}, {"role": "assistant", "content": pergunta}, {"role": "user", "content": "Livre"},
    ]}, headers=a.headers)
    assert "zorp]] (Livre)" in r2.json()["reply"]


def test_se_nao_tiver_adiciona(client, conta):
    a = conta()
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Já tem obrigado da minha lista de vocabulário se não tiver pode adicionar"}]}, headers=a.headers)
    assert "[[thank you]] (obrigado)" in r.json()["reply"]


def test_troca_expressao_antes_das_palavras():
    vocab = [Palavra("expressions:x", "good evening", "boa noite", 1), Palavra("words:n", "night", "noite", 1)]
    texto, usadas = usar_vocabulario("Boa noite! Como foi?", vocab, marcas=True)
    assert texto.startswith("[[Good evening]]") and usadas == ["Good evening"]
