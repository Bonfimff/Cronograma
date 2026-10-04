"""A resposta do modelo chega aos pedaços (/chat/stream) e termina com a versão final, já marcada."""

import json

from app import chat_slot


def test_reply_parcial_le_o_json_pela_metade():
    assert chat_slot.reply_parcial('{"reply": "Oi, tudo b') == "Oi, tudo b"
    assert chat_slot.reply_parcial('{"reply": "Voc\\u00ea est') == "Você est"
    assert chat_slot.reply_parcial('{"reply": "Voc\\u00') == "Voc"  # escape ainda chegando
    assert chat_slot.reply_parcial('{"rep') == ""


class _Fluxo:
    """Imita o Ollama com stream: uma linha JSON por pedaço."""

    def __init__(self, pedacos):
        self.linhas = [json.dumps({"message": {"content": p}, "done": False}).encode() + b"\n" for p in pedacos]
        self.linhas.append(json.dumps({"message": {"content": ""}, "done": True}).encode() + b"\n")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __iter__(self):
        return iter(self.linhas)


def test_chamar_ao_vivo_manda_o_texto_parcial(monkeypatch):
    pedacos = ['{"reply": "Que ', 'dia ', 'bom!"', ', "trocar": []}']
    monkeypatch.setattr(chat_slot.urllib.request, "urlopen", lambda req, timeout=None: _Fluxo(pedacos))
    vistos: list[str] = []
    reply, trocar = chat_slot._chamar("http://x", "m", "s", [{"role": "user", "content": "oi"}], [], 200, 0.3, None, 5, vistos.append)
    assert reply == "Que dia bom!" and trocar == []
    assert vistos[0] == "Que " and vistos[-1] == "Que dia bom!"


def test_rota_stream_manda_parciais_e_final(client, conta, monkeypatch):
    def falso(url, modelo, sistema, historico, palavras, limite, temp, seed, timeout, ao_vivo=None):
        for parte in ("Estou ", "Estou cansado ", "Estou cansado hoje."):
            if ao_vivo:
                ao_vivo(parte)
        return "Estou cansado hoje.", []

    monkeypatch.setattr(chat_slot, "_chamar", falso)
    a = conta()
    r = client.post("/chat/stream", json={"messages": [{"role": "user", "content": "Como foi seu dia?"}]}, headers=a.headers)
    assert r.status_code == 200
    linhas = [json.loads(x) for x in r.text.strip().splitlines()]
    assert [x["parcial"] for x in linhas if "parcial" in x][-1] == "Estou cansado hoje."
    assert "final" in linhas[-1] and "cansado" in linhas[-1]["final"]["reply"]
