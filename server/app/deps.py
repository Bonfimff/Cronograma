"""Dependências compartilhadas pelas rotas."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import db_session
from .models import User
from .security import read_token

bearer = HTTPBearer(auto_error=False)

UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Faça login novamente.",
    headers={"WWW-Authenticate": "Bearer"},
)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(db_session),
) -> User:
    if credentials is None:
        raise UNAUTHORIZED
    payload = read_token(credentials.credentials, "access")
    if not payload:
        raise UNAUTHORIZED
    user = db.get(User, int(payload["sub"]))
    if user is None or payload.get("epoch") != user.token_epoch:
        raise UNAUTHORIZED
    return user
