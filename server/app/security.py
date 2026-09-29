"""Senhas e tokens.

A senha nunca é guardada: fica só o hash Argon2id (vencedor do Password Hashing
Competition, com custo de memória — resiste a ataque com GPU). Os tokens são JWT
assinados com a chave do servidor: o de acesso é curto, o de renovação é longo e
carrega a "época" do usuário, o que permite invalidar todos de uma vez.
"""

from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from .config import settings

_hasher = PasswordHasher()
ALGORITHM = "HS256"
TokenKind = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def check_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    """Parâmetros do Argon2 mudaram desde que a senha foi salva?"""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def make_token(user_id: int, kind: TokenKind, epoch: int = 0) -> str:
    cfg = settings()
    life = (
        timedelta(minutes=cfg.access_token_minutes)
        if kind == "access"
        else timedelta(days=cfg.refresh_token_days)
    )
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "kind": kind, "epoch": epoch, "iat": now, "exp": now + life}
    return jwt.encode(payload, cfg.secret_key, algorithm=ALGORITHM)


def read_token(token: str, kind: TokenKind) -> dict | None:
    """Devolve o conteúdo do token, ou None se estiver vencido, adulterado ou for de outro tipo."""
    try:
        payload = jwt.decode(token, settings().secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("kind") != kind:
        return None
    return payload
