"""Chat com profundidade: texto livre (sem JSON), regras novas e palavras em foco vindas do app."""

import json

from app import chat_slot
from app.routers.chat import em_foco
from app.vocabulario import Palavra


def test_limpar_texto_livre():
    assert chat_slot.limpar_texto_livre('"Que dia bom!"') == "Que dia bom!"
    assert chat_slot.limpar_texto_livre("Amigo de treino: Que legal!") == "Que legal!"
    assert chat_slot.limpar_texto_livre("  Oi, tudo bem?  ") == "Oi, tudo bem?"


class _Fluxo:
    def __init__(self, pedacos):
        self.linhas = [json.dumps({"message": {"content": p}, "done": False}).encode() + b"\n" for p in pedacos]
        self.linhas.append(json.dumps({"message": {"content": ""}, "done": True}).encode() + b"\n")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        return iter(self.linhas)


def test_texto_livre_sem_esquema_e_ao_vivo(monkeypatch):
    enviado = {}

    def falso(req, timeout=None):
        enviado.update(json.loads(req.data.decode("utf-8")))
        return _Fluxo(["Que ", "bom que ", "você descansou."])

    monkeypatch.setattr(chat_slot.urllib.request, "urlopen", falso)
    vistos: list[str] = []
    reply, trocar = chat_slot._chamar("http://x", "m", "s", [{"role": "user", "content": "oi"}], [], 200, 0.6, None, 5,
                                      vistos.append, texto_livre=True)
    assert "format" not in enviado  # sem JSON: o modelo escreve livre
    assert reply == "Que bom que você descansou." and trocar == []
    assert vistos[-1] == "Que bom que você descansou."


def test_regras_dao_espaco_para_profundidade():
    assert "two to four sentences" in chat_slot.REGRAS
    assert "real substance" in chat_slot.REGRAS
    instr = chat_slot.instrucao([Palavra("words:w", "work", "trabalho", 1)], texto_livre=True)
    assert "TODAY'S WORDS" in instr and "trocar" not in instr


def test_responder_usa_texto_livre_com_o_vocabulario(monkeypatch):
    chamado = {}

    def falso(*a, **k):
        chamado.update(k)
        chamado["temperatura"] = a[6]
        return "Que bom ouvir isso! Você descansou no fim de semana?", []

    monkeypatch.setattr(chat_slot, "_chamar", falso)
    r = chat_slot.responder("http://x", "m", [{"role": "user", "content": "Estou bem"}], [], vocab_completo=[])
    assert chamado.get("texto_livre") is True and chamado["temperatura"] >= 0.6
    assert r["problema"] is None


def test_em_foco_traz_as_palavras_do_app_para_a_frente():
    vocab = [Palavra("words:a", "apple", "maçã", 9), Palavra("words:w", "work", "trabalho", 1), Palavra("words:t", "tired", "cansado", 2)]
    assert [p.en for p in em_foco(vocab, ["tired", "work"])] == ["tired", "work", "apple"]
    assert em_foco(vocab, []) == vocab
