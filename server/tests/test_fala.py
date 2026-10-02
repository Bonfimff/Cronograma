"""Rota do Fala-Rápida: repassa o áudio ao reconhecedor do computador de casa."""

import struct
import urllib.error

from app.routers import fala

AUDIO = struct.pack("<4f", 0.0, 0.1, -0.1, 0.0)
BIN = {"Content-Type": "application/octet-stream"}


def test_repassa_o_audio_e_devolve_o_texto(client, conta, monkeypatch):
    recebido = {}

    def falso(audio):
        recebido["audio"] = audio
        return {"text": " House", "ms": 300}

    monkeypatch.setattr(fala, "_repassar", falso)
    a = conta()
    r = client.post("/fala/transcrever", content=AUDIO, headers={**a.headers, **BIN})
    assert r.status_code == 200, r.text
    assert r.json() == {"text": " House"}
    assert recebido["audio"] == AUDIO


def test_precisa_estar_logado(client):
    assert client.post("/fala/transcrever", content=AUDIO, headers=BIN).status_code == 401


def test_audio_invalido(client, conta):
    a = conta()
    r = client.post("/fala/transcrever", content=b"abc", headers={**a.headers, **BIN})
    assert r.status_code == 422


def test_reconhecedor_fora_do_ar(client, conta, monkeypatch):
    def fora(_):
        raise urllib.error.URLError("recusado")

    monkeypatch.setattr(fala, "_repassar", fora)
    a = conta()
    r = client.post("/fala/transcrever", content=AUDIO, headers={**a.headers, **BIN})
    assert r.status_code == 503

def test_saude(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(fala, "_saude", lambda: True)
    assert client.get("/fala/saude", headers=a.headers).json() == {"ok": True}

    def fora():
        raise urllib.error.URLError("recusado")

    monkeypatch.setattr(fala, "_saude", fora)
    assert client.get("/fala/saude", headers=a.headers).json() == {"ok": False}