"""As perguntas do treino escritas no pacote semanal (sessão.treino) vêm antes das automáticas."""

from sqlalchemy import select

from app import db as db_mod
from app.models import User
from app.treino import perguntas


def test_treino_da_aula_vem_primeiro(client, conta):
    a = conta()
    sessao = {"id": "ENG-2026-0001", "date": "2026-10-05", "treino": [
        {"en": "Where do you work?", "pt": "Onde você trabalha?", "resposta": "I work at ____."},
        {"en": "What time do you wake up?"},
    ]}
    a.push([{"kind": "session", "id": "ENG-2026-0001", "data": sessao}])
    with db_mod.SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "eu@exemplo.com"))
        lista = perguntas(db, user)
    assert [p.en for p in lista] == ["Where do you work?", "What time do you wake up?"]
    assert lista[0].modelo == "I work at ____." and lista[1].pt == ""
