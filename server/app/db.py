"""Ligação com o banco: engine, sessão e a base dos modelos."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _engine():
    """
    Uma engine para o banco configurado.

    SQLite serve ao desenvolvimento (nenhuma instalação); MySQL/MariaDB e
    Postgres servem em produção. Cada um pede um ajuste próprio:

    - SQLite: liberar o acesso entre as threads do servidor;
    - MySQL: reciclar a conexão antes do `wait_timeout` do servidor (o padrão é
      8 horas, e uma conexão derrubada no meio do caminho vira erro na primeira
      requisição da manhã) e falar utf8mb4, senão emoji e acentos se perdem.
    """
    url = settings().database_url
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    elif url.startswith("mysql"):
        kwargs["pool_recycle"] = 1800
        kwargs["connect_args"] = {"charset": "utf8mb4"}
    return create_engine(url, **kwargs)


engine = _engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def db_session() -> Iterator[Session]:
    """Dependência do FastAPI: uma sessão de banco por requisição."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all() -> None:
    from . import models  # noqa: F401 — registra os modelos antes de criar as tabelas

    Base.metadata.create_all(engine)
