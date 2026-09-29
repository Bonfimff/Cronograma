"""Contas: criar, entrar, renovar o acesso e sair de todos os aparelhos."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import db_session
from ..deps import UNAUTHORIZED, current_user
from ..models import Record, User
from ..schemas import Credentials, Me, Refresh, Tokens
from ..security import check_password, hash_password, make_token, needs_rehash, read_token

router = APIRouter(prefix="/auth", tags=["conta"])


def _tokens(user: User) -> Tokens:
    return Tokens(
        access_token=make_token(user.id, "access", user.token_epoch),
        refresh_token=make_token(user.id, "refresh", user.token_epoch),
    )


def _find(db: Session, email: str) -> User | None:
    # e-mail não diferencia maiúsculas: guardamos e comparamos sempre em minúsculas
    return db.scalar(select(User).where(User.email == email.strip().lower()))


@router.post("/register", response_model=Tokens, status_code=status.HTTP_201_CREATED)
def register(body: Credentials, db: Session = Depends(db_session)) -> Tokens:
    if _find(db, body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe uma conta com esse e-mail.")
    user = User(email=body.email.strip().lower(), password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return _tokens(user)


@router.post("/login", response_model=Tokens)
def login(body: Credentials, db: Session = Depends(db_session)) -> Tokens:
    user = _find(db, body.email)
    # a mensagem é a mesma para e-mail inexistente e senha errada: não entrega quem tem conta
    if user is None or not check_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha incorretos.")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
        db.commit()
    return _tokens(user)


@router.post("/refresh", response_model=Tokens)
def refresh(body: Refresh, db: Session = Depends(db_session)) -> Tokens:
    payload = read_token(body.refresh_token, "refresh")
    if not payload:
        raise UNAUTHORIZED
    user = db.get(User, int(payload["sub"]))
    if user is None or payload.get("epoch") != user.token_epoch:
        raise UNAUTHORIZED
    return _tokens(user)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(user: User = Depends(current_user), db: Session = Depends(db_session)) -> None:
    """Invalida os tokens de todos os aparelhos (útil se um deles se perder)."""
    user.token_epoch += 1
    db.commit()


@router.get("/me", response_model=Me)
def me(user: User = Depends(current_user), db: Session = Depends(db_session)) -> Me:
    total = db.scalar(
        select(func.count()).select_from(Record).where(Record.user_id == user.id, Record.deleted.is_(False))
    )
    return Me(id=user.id, email=user.email, revision=user.revision, records=total or 0)
