"""
Professor com acesso ao histórico do aluno.

O aluno autoriza pelo e-mail de uma conta que já existe; dali em diante essa conta
lê (nunca grava) os registros do aluno e monta o mesmo relatório de progresso. O
aluno pode tirar o acesso quando quiser.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import db_session
from ..deps import current_user
from ..models import Acesso, Record, User
from ..schemas import RecordOut

router = APIRouter(prefix="/acesso", tags=["professor"])

# o que o relatório precisa: nada de configurações nem placares de jogos antigos
KINDS_DO_RELATORIO = ("week", "session", "worksheet", "history", "content", "chat", "activity")


class Pessoa(BaseModel):
    id: int
    email: str


class AcessosOut(BaseModel):
    professores: list[Pessoa]
    alunos: list[Pessoa]


class AutorizarIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


def _pessoas(db: Session, ids: list[int]) -> list[Pessoa]:
    if not ids:
        return []
    return [Pessoa(id=u.id, email=u.email) for u in db.scalars(select(User).where(User.id.in_(ids))).all()]


@router.get("", response_model=AcessosOut)
def listar(user: User = Depends(current_user), db: Session = Depends(db_session)) -> AcessosOut:
    meus = db.scalars(select(Acesso).where(Acesso.aluno_id == user.id)).all()
    deles = db.scalars(select(Acesso).where(Acesso.professor_id == user.id)).all()
    return AcessosOut(professores=_pessoas(db, [a.professor_id for a in meus]), alunos=_pessoas(db, [a.aluno_id for a in deles]))


@router.post("", response_model=AcessosOut, status_code=status.HTTP_201_CREATED)
def autorizar(entrada: AutorizarIn, user: User = Depends(current_user), db: Session = Depends(db_session)) -> AcessosOut:
    email = entrada.email.strip().lower()
    professor = db.scalar(select(User).where(User.email == email))
    if not professor:
        raise HTTPException(status_code=404, detail="Não há conta com esse e-mail. O professor precisa criar a conta antes.")
    if professor.id == user.id:
        raise HTTPException(status_code=400, detail="Esse é o seu próprio e-mail.")
    if not db.scalar(select(Acesso).where(Acesso.aluno_id == user.id, Acesso.professor_id == professor.id)):
        db.add(Acesso(aluno_id=user.id, professor_id=professor.id))
        db.commit()
    return listar(user, db)


@router.delete("/{professor_id}", response_model=AcessosOut)
def revogar(professor_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)) -> AcessosOut:
    a = db.scalar(select(Acesso).where(Acesso.aluno_id == user.id, Acesso.professor_id == professor_id))
    if a:
        db.delete(a)
        db.commit()
    return listar(user, db)


@router.get("/alunos/{aluno_id}", response_model=list[RecordOut])
def dados_do_aluno(aluno_id: int, user: User = Depends(current_user), db: Session = Depends(db_session)) -> list[RecordOut]:
    if not db.scalar(select(Acesso).where(Acesso.aluno_id == aluno_id, Acesso.professor_id == user.id)):
        raise HTTPException(status_code=403, detail="Este aluno não autorizou o seu acesso.")
    rows = db.scalars(
        select(Record).where(Record.user_id == aluno_id, Record.deleted.is_(False), Record.kind.in_(KINDS_DO_RELATORIO))
    ).all()
    return [RecordOut(kind=r.kind, id=r.record_id, data=r.data or {}, deleted=False, revision=r.revision) for r in rows]
