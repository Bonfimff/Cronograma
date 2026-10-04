"""Consultas de verdade (hora, data, tempo, curiosidade, Wikipédia) e saudação pelo horário de Brasília."""

from datetime import datetime

from app import chat_slot, consultas
from app.consultas import BRASILIA, ajustar_saudacao, cidade_da_frase, responder_consulta, saudacao
from app.routers import chat

DOMINGO_MANHA = datetime(2026, 10, 4, 9, 33, tzinfo=BRASILIA)

FALSO = {
    "geocoding": {"results": [{"name": "Rio de Janeiro", "latitude": -22.9, "longitude": -43.2, "country_code": "BR"}]},
    "forecast": {"current": {"temperature_2m": 24.4, "weather_code": 2},
                 "daily": {"weather_code": [2, 61], "temperature_2m_min": [19.6, 21.8], "temperature_2m_max": [27.2, 29.1],
                           "precipitation_probability_max": [10, 55]}},
    "onthisday": {"selected": [{"year": 1957, "text": "A União Soviética lança o Sputnik-1."}]},
    "search/title": {"pages": [{"key": "Santos_Dumont"}]},
    "summary": {"extract": "Alberto Santos Dumont foi um aeronauta e inventor brasileiro. Projetou dirigíveis. Morreu em 1932."},
}


def _rede_falsa(monkeypatch):
    def buscar(url, validade=600):
        return next(v for k, v in FALSO.items() if k in url)
    monkeypatch.setattr(consultas, "_buscar_json", buscar)
    monkeypatch.setattr(consultas, "agora", lambda: DOMINGO_MANHA)


def _pergunta(fala, antes=()):
    return responder_consulta([*antes, {"role": "user", "content": fala}])


def test_saudacao_pelo_horario_de_brasilia():
    assert saudacao(datetime(2026, 10, 4, 9, 0, tzinfo=BRASILIA)) == "Bom dia"
    assert saudacao(datetime(2026, 10, 4, 14, 0, tzinfo=BRASILIA)) == "Boa tarde"
    assert saudacao(datetime(2026, 10, 4, 21, 0, tzinfo=BRASILIA)) == "Boa noite"
    assert saudacao(datetime(2026, 10, 4, 3, 0, tzinfo=BRASILIA)) == "Boa noite"
    assert ajustar_saudacao("Olá! Como posso ajudar?", "Oi", DOMINGO_MANHA) == "Bom dia! Como posso ajudar?"
    assert ajustar_saudacao("Boa noite! Tudo certo?", "boa tarde", DOMINGO_MANHA) == "Bom dia! Tudo certo?"
    assert ajustar_saudacao("Que legal!", "Fui ao parque", DOMINGO_MANHA) == "Que legal!"  # sem cumprimento, sem saudação


def test_hora_e_data(monkeypatch):
    _rede_falsa(monkeypatch)
    assert _pergunta("Que horas são?") == "Agora são 09:33 no horário de Brasília."
    assert _pergunta("Que dia é hoje?") == "Hoje é domingo, 4 de outubro de 2026."


def test_tempo_da_pergunta_do_historico(monkeypatch):
    _rede_falsa(monkeypatch)
    assert cidade_da_frase("Qual é a previsão do tempo para amanhã no rio de janeiro") == "rio de janeiro"
    r = _pergunta("Qual é a previsão do tempo para amanhã no rio de janeiro")
    assert r == "Em Rio de Janeiro. Amanhã: chuva fraca, mínima de 22°C e máxima de 29°C, chance de chuva de 55%. (Open-Meteo)"
    hoje = _pergunta("Como está o tempo em Rio de Janeiro?")
    assert hoje.startswith("Agora em Rio de Janeiro: 24°C, parcialmente nublado. Hoje:")


def test_tempo_lembra_a_cidade_e_pergunta_quando_falta(monkeypatch):
    _rede_falsa(monkeypatch)
    antes = [{"role": "user", "content": "previsão em Rio de Janeiro"}, {"role": "assistant", "content": "..."}]
    assert "Amanhã: chuva fraca" in _pergunta("e amanhã, vai chover?", antes)
    assert _pergunta("vai chover amanhã?").startswith("De qual cidade?")


def test_curiosidade_e_wikipedia(monkeypatch):
    _rede_falsa(monkeypatch)
    assert _pergunta("Me conta uma novidade") == "Neste dia, em 1957: A União Soviética lança o Sputnik-1. (Wikipédia)"
    assert _pergunta("Quem foi Santos Dumont?") == (
        "Alberto Santos Dumont foi um aeronauta e inventor brasileiro. Projetou dirigíveis. (Wikipédia)")


def test_sem_rede_avisa_sem_inventar(monkeypatch):
    def caiu(url, validade=600):
        raise OSError("sem rede")
    monkeypatch.setattr(consultas, "_buscar_json", caiu)
    assert _pergunta("Vai chover em São Paulo?") == "Não consegui consultar agora. Tente de novo daqui a pouco."


def test_conversa_comum_nao_vira_consulta():
    for fala in ("Oi! Tudo bem?", "Estou cansado hoje", "Gosto de tomar café", "Vou jogar bola"):
        assert _pergunta(fala) is None, fala


def test_a_rota_cumprimenta_pelo_horario(client, conta, monkeypatch):
    monkeypatch.setattr(consultas, "agora", lambda: datetime(2026, 10, 4, 15, 0, tzinfo=BRASILIA))
    monkeypatch.setattr(chat_slot, "_chamar", lambda *a, **k: ("Olá! Tudo certo por aí?", []))
    a = conta()
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Oi"}]}, headers=a.headers)
    assert r.json()["reply"] == "Boa tarde! Tudo certo por aí?"


def test_a_rota_responde_a_hora(client, conta, monkeypatch):
    _rede_falsa(monkeypatch)
    monkeypatch.setattr(chat, "responder", lambda *a, **k: (_ for _ in ()).throw(AssertionError("não chama o modelo")))
    a = conta()
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "que horas são?"}]}, headers=a.headers)
    assert r.json()["reply"] == "Agora são 09:33 no horário de Brasília."