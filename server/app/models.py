"""
Modelos do banco.

O aplicativo continua sendo a fonte da verdade do formato: cada registro é
guardado como o mesmo JSON que o app já usa (`UserData`), dentro de uma linha
que diz de quem é, de que tipo é e em que revisão foi gravado. Assim o servidor
sincroniza sem precisar conhecer cada campo de cada conteúdo — e o formato pode
evoluir no app sem migração aqui.
"""

from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    # revisão atual dos dados deste usuário: cresce a cada gravação e guia a sincronização
    revision: Mapped[int] = mapped_column(BigInteger, default=0)
    # invalida os refresh tokens antigos quando a senha muda ou a conta é desconectada
    token_epoch: Mapped[int] = mapped_column(Integer, default=0)

    records: Mapped[list["Record"]] = relationship(back_populates="user", cascade="all, delete-orphan")


#: tipos que o app sincroniza — o mesmo nome que ele usa no `UserData`
KINDS = ("week", "session", "worksheet", "history", "sheet", "content", "game")


class Record(Base):
    """Um registro sincronizado: uma sessão, uma semana, uma folha, um placar…"""

    __tablename__ = "records"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "record_id", name="uq_record"),
        Index("ix_records_user_revision", "user_id", "revision"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    record_id: Mapped[str] = mapped_column(String(128))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(BigInteger, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    # de qual aparelho veio a última gravação (só para conferência e diagnóstico)
    device: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped[User] = relationship(back_populates="records")
