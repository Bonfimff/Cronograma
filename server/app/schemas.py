"""Formatos de entrada e saída da API (o que entra é sempre validado)."""

from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from .models import KINDS

Kind = Literal["week", "session", "worksheet", "history", "sheet", "content", "game"]

MIN_PASSWORD = 8


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)

    @field_validator("password")
    @classmethod
    def not_only_spaces(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("senha em branco")
        return v


class Tokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class Refresh(BaseModel):
    refresh_token: str


class Me(BaseModel):
    id: int
    email: EmailStr
    revision: int
    records: int


class RecordIn(BaseModel):
    kind: Kind
    id: str = Field(min_length=1, max_length=128)
    data: dict[str, Any] = Field(default_factory=dict)
    deleted: bool = False

    @field_validator("kind")
    @classmethod
    def known_kind(cls, v: str) -> str:
        if v not in KINDS:
            raise ValueError(f"tipo desconhecido: {v}")
        return v


class RecordOut(RecordIn):
    revision: int


class PushIn(BaseModel):
    """Envio de alterações do aparelho. `since` é a revisão que ele já tinha."""

    device: str | None = Field(default=None, max_length=64)
    since: int = 0
    items: list[RecordIn] = Field(default_factory=list, max_length=2000)


class PushOut(BaseModel):
    revision: int
    saved: int
    ignored: int
    # o que mudou no servidor desde `since` (inclusive o que este envio acabou de gravar)
    items: list[RecordOut]


class PullOut(BaseModel):
    revision: int
    items: list[RecordOut]
