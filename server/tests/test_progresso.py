"""Relatório de progresso: atividades sincronizam e a análise da IA não inventa números."""

from app.routers import progresso

RESUMO = "Últimos 7 dias: 42 min de estudo, 9 atividades, acerto 78% (semana anterior: 64%).\nPalavras com mais erro: work (40%)."

BOA = """• Evolução: o acerto subiu de 64% para 78% nos últimos 7 dias.
• Pontos fortes: você manteve 9 atividades na semana.
• Dificuldades: work ainda tem 40% de acerto.
• Padrão: estude à noite, quando rende mais.
• Próximo passo: revise work em 2 jogos curtos."""


def test_aceita_a_analise_com_os_numeros_do_resumo():
    assert progresso.validar(BOA, RESUMO).count("• ") == 5


def test_recusa_numero_inventado_e_formato_errado():
    assert progresso.validar(BOA.replace("78%", "93%"), RESUMO) is None
    assert progresso.validar("Você foi muito bem esta semana!", RESUMO) is None


def test_rota_da_analise(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(progresso, "_chamar", lambda resumo: BOA)
    r = client.post("/progresso/analise", json={"resumo": RESUMO}, headers=a.headers)
    assert r.status_code == 200, r.text
    assert r.json()["fonte"] == "ia" and r.json()["texto"].startswith("• Evolução")
    monkeypatch.setattr(progresso, "_chamar", lambda resumo: "Ótimo trabalho, 100% perfeito!")
    assert client.post("/progresso/analise", json={"resumo": RESUMO}, headers=a.headers).status_code == 422


def test_atividade_sincroniza(client, conta):
    a = conta()
    atividade = {"id": "at-1", "quando": "2026-10-04T09:30:00Z", "tipo": "jogo", "origem": "tetris", "duracaoSeg": 180,
                 "acertos": 5, "erros": 1, "palavras": [{"en": "work", "ok": True}]}
    a.push([{"kind": "activity", "id": "at-1", "data": atividade}])
    itens = client.get("/sync/pull", params={"since": 0}, headers=a.headers).json()["items"]
    assert any(i["kind"] == "activity" and i["data"]["origem"] == "tetris" for i in itens)
