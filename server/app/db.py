"""Ligação com o banco: engine, sessão e a base dos modelos."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _engine():
    url = settings().database_url
    # o SQLite do desenvolvimento precisa liberar o acesso entre threads do servidor
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    return create_engine(url, pool_pre_ping=True, **kwargs)


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
