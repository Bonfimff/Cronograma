"""Vocabulário pelo chat: adicionar de verdade, conferir se está na lista, e a lista em mais formas."""

from app.chat_slot import promete_memoria
from app.routers import chat
from app.vocab_chat import palavras_pedidas

PALAVRAS = [("name", "nome"), ("work", "trabalhar"), ("you", "você")]


def _nao_deveria(*_a, **_k):
    raise AssertionError("isto não passa pelo modelo")


def _conta(conta):
    a = conta()
    a.push([{"kind": "content", "id": f"words:{en}", "data": {"word": en, "translations": [{"text": pt}]}} for en, pt in PALAVRAS])
    return a


def _falar(client, a, texto):
    r = client.post("/chat", json={"messages": [{"role": "user", "content": texto}]}, headers=a.headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_entende_os_pedidos_do_historico():
    assert palavras_pedidas("Coloque na minha lista a palavra Hi e Hello") == ["hi", "hello"]
    assert palavras_pedidas("Então adiciona hi e Hello nessa lista") == ["hi", "hello"]
    assert palavras_pedidas("adicione dog = cachorro e cat = gato") == ["dog", "cat"]


def test_adiciona_de_verdade_e_a_lista_mostra(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    a = _conta(conta)
    r = _falar(client, a, "Coloque na minha lista a palavra Hi e Hello")
    assert r["reply"].startswith("Pronto! Adicionei ao seu vocabulário: [[hi]] (oi), [[hello]] (olá).")
    assert {g["en"] for g in r["glossary"]} == {"hi", "hello"}
    # chega aos aparelhos na sincronização, no formato de palavra anotada no app
    itens = a.pull()["items"]
    novas = {i["data"]["word"]: i for i in itens if i["kind"] == "content" and i["data"].get("word") in {"hi", "hello"}}
    assert set(novas) == {"hi", "hello"} and novas["hi"]["data"]["translations"] == [{"text": "oi"}]
    assert novas["hi"]["id"].startswith("words:hi-")
    lista = _falar(client, a, "Qual é o meu vocabulário")["reply"]
    assert lista.startswith("Você tem 5 palavras no vocabulário:") and "[[hello]] (olá)" in lista
    de_novo = _falar(client, a, "adiciona hi na lista")["reply"]
    assert de_novo.startswith("Já estavam na lista: [[hi]] (oi).")


def test_traducao_dada_ou_perguntada(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    a = _conta(conta)
    r = _falar(client, a, "adicione dog = cachorro e zorbix na lista")["reply"]
    assert "[[dog]] (cachorro)" in r and "Não sei a tradução de zorbix" in r


def test_tem_na_lista(client, conta, monkeypatch):
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    a = _conta(conta)
    r = _falar(client, a, "Tem hi ou name nessa lista?")["reply"]
    assert r == "Sim, está na sua lista: [[name]] (nome). Não está na lista: hi. Quer que eu adicione? É só dizer: adicione hi."


def test_modelo_nao_pode_dizer_que_adicionou():
    assert promete_memoria("Sim, agora tem!")
    assert promete_memoria("Pronto, adicionei hello ao seu vocabulário.")
    assert not promete_memoria("Que bom te ver hoje!")