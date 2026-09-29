"""Cada teste roda contra um banco SQLite próprio, criado do zero."""

import os
import tempfile
from collections.abc import Iterator

import pytest

os.environ.setdefault("ENGLISH_SECRET_KEY", "chave-de-teste")


@pytest.fixture()
def client(monkeypatch) -> Iterator:
    from fastapi.testclient import TestClient

    tmp = tempfile.TemporaryDirectory()
    caminho = os.path.join(tmp.name, "teste.db")

    from app import config, db as db_mod

    config.settings.cache_clear()
    monkeypatch.setenv("ENGLISH_DATABASE_URL", f"sqlite:///{caminho}")
    config.settings.cache_clear()

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(f"sqlite:///{caminho}", connect_args={"check_same_thread": False})
    monkeypatch.setattr(db_mod, "engine", engine)
    monkeypatch.setattr(db_mod, "SessionLocal", sessionmaker(bind=engine, autoflush=False, expire_on_commit=False))

    from app.main import app

    with TestClient(app) as c:
        yield c
    engine.dispose()
    tmp.cleanup()
    config.settings.cache_clear()


@pytest.fixture()
def conta(client):
    """Cria uma conta e devolve um ajudante que já manda o token em tudo."""

    def criar(email: str = "eu@exemplo.com", senha: str = "senha-bem-grande"):
        r = client.post("/auth/register", json={"email": email, "password": senha})
        assert r.status_code == 201, r.text
        return Aparelho(client, r.json()["access_token"])

    return criar


class Aparelho:
    """Um aparelho logado: guarda o token e a última revisão que já viu."""

    def __init__(self, client, token: str, nome: str = "teste"):
        self.client = client
        self.token = token
        self.nome = nome
        self.revisao = 0

    @property
    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    def push(self, itens: list[dict]) -> dict:
        r = self.client.post(
            "/sync/push",
            json={"device": self.nome, "since": self.revisao, "items": itens},
            headers=self.headers,
        )
        assert r.status_code == 200, r.text
        corpo = r.json()
        self.revisao = corpo["revision"]
        return corpo

    def pull(self) -> dict:
        r = self.client.get("/sync/pull", params={"since": self.revisao}, headers=self.headers)
        assert r.status_code == 200, r.text
        corpo = r.json()
        self.revisao = corpo["revision"]
        return corpo
