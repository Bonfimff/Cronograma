"""Todas as palavras do vocabulário que couberem vão nas respostas (histórico de 04/10)."""

from app import chat_slot
from app.usar_vocabulario import usar_vocabulario
from app.vocabulario import Palavra

VOCAB = [Palavra(f"words:{e}", e, p, 1.0) for e, p in [
    ("do", "auxiliar de pergunta"), ("where", "onde"), ("work", "trabalhar"), ("are", "está / estão / é / são"),
    ("hello", "olá"), ("hi", "oi"), ("how", "como"), ("nice", "agradável / prazer"), ("to", "para / a"),
    ("what", "o que / qual"), ("you", "você / vocês"), ("meet", "conhecer / encontrar"), ("name", "nome"),
]]


def test_respostas_do_historico_usam_o_vocabulario():
    assert usar_vocabulario("Olá! Como posso ajudar?", VOCAB)[0] == "Hello! How posso ajudar?"
    assert usar_vocabulario("Estou aqui para conversar com você.", VOCAB)[0] == "Estou aqui to conversar com you."
    assert usar_vocabulario("Oi, Felipe! Como você está hoje?", VOCAB)[0] == "Hi, Felipe! How are you hoje?"


def test_frases_inteiras_e_verbos_conjugados():
    assert usar_vocabulario("Onde você trabalha? Eu trabalho em casa.", VOCAB)[0] == "Where do you work? Eu work em casa."
    assert usar_vocabulario("Prazer em conhecer você! Qual é o seu nome?", VOCAB)[0] == "Nice to meet you! What is your name?"


def test_nao_troca_o_ambiguo_nem_cola_duas_de_conteudo():
    texto, _ = usar_vocabulario("Felipe é um nome bonito, é agradável.", VOCAB)
    assert texto == "Felipe é um name bonito, é nice."  # "é" não vira "are"
    texto, _ = usar_vocabulario("um nome trabalho", VOCAB)
    assert texto == "um name trabalho"


def test_marcas_so_nas_palavras_do_vocabulario():
    marcado, usadas = usar_vocabulario("Qual é o seu nome? Do outro lado do rio.", VOCAB, marcas=True)
    assert marcado == "[[What]] is your [[name]]? Do outro lado do rio."  # "do" do português fica sem marca
    assert usadas == ["What is your name"]


def test_a_rota_entrega_a_resposta_com_o_vocabulario(client, conta, monkeypatch):
    monkeypatch.setattr(chat_slot, "_chamar", lambda *a, **k: ("Olá! Como você está hoje?", []))
    a = conta()
    a.push([{"kind": "content", "id": f"words:{p.en}", "data": {"word": p.en, "translations": [{"text": p.pt}]}} for p in VOCAB])
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Tudo certo?"}]}, headers=a.headers)  # sem cumprimento: a saudação por horário não entra
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["reply"] == "[[Hello]]! [[How]] [[are]] [[you]] hoje?"
    assert {g["en"] for g in corpo["glossary"]} == {"hello", "how", "are", "you"}