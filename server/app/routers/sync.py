"""
Sincronização entre aparelhos.

A ideia é simples: cada usuário tem um contador de revisão que só cresce. Toda
gravação recebe a revisão seguinte. O aparelho guarda a última revisão que viu e
pergunta "o que mudou depois disso?" — recebe só a diferença, nunca o banco
inteiro.

Quando o mesmo registro é alterado em dois aparelhos, vence a última gravação
(o registro é pequeno e pertence a uma pessoa só). Apagar não remove a linha:
marca `deleted`, para que o outro aparelho fique sabendo que aquilo saiu.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import db_session
from ..deps import current_user
from ..models import Record, User
from ..schemas import PullOut, PushIn, PushOut, RecordOut

router = APIRouter(prefix="/sync", tags=["sincronização"])

MAX_PAGE = 1000


def _changes(db: Session, user: User, since: int, limit: int = MAX_PAGE) -> list[RecordOut]:
    rows = db.scalars(
        select(Record)
        .where(Record.user_id == user.id, Record.revision > since)
        .order_by(Record.revision)
        .limit(limit)
    ).all()
    return [
        RecordOut(kind=r.kind, id=r.record_id, data=r.data or {}, deleted=r.deleted, revision=r.revision)
        for r in rows
    ]


@router.get("/pull", response_model=PullOut)
def pull(
    since: int = Query(0, ge=0, description="última revisão que este aparelho já tem"),
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> PullOut:
    items = _changes(db, user, since)
    # com a página cheia, a revisão devolvida é a do último item: o aparelho pede o resto
    revision = items[-1].revision if len(items) == MAX_PAGE else user.revision
    return PullOut(revision=revision, items=items)


@router.post("/push", response_model=PushOut)
def push(
    body: PushIn,
    user: User = Depends(current_user),
    db: Session = Depends(db_session),
) -> PushOut:
    saved = 0
    ignored = 0
    existentes = {
        (r.kind, r.record_id): r
        for r in db.scalars(
            select(Record).where(
                Record.user_id == user.id,
                Record.kind.in_({i.kind for i in body.items}),
                Record.record_id.in_({i.id for i in body.items}),
            )
        ).all()
    } if body.items else {}

    for item in body.items:
        atual = existentes.get((item.kind, item.id))
        # o servidor já tem uma versão mais nova que este aparelho nunca viu: ela vence,
        # e o aparelho recebe essa versão na resposta
        if atual is not None and atual.revision > body.since:
            ignored += 1
            continue
        user.revision += 1
        if atual is None:
            atual = Record(user_id=user.id, kind=item.kind, record_id=item.id)
            db.add(atual)
            existentes[(item.kind, item.id)] = atual
        atual.data = item.data
        atual.deleted = item.deleted
        atual.revision = user.revision
        atual.device = body.device
        saved += 1

    db.commit()
    return PushOut(revision=user.revision, saved=saved, ignored=ignored, items=_changes(db, user, body.since))


@router.get("/status")
def status(user: User = Depends(current_user), db: Session = Depends(db_session)) -> dict:
    """Quanto o servidor tem, por tipo — o app mostra isso antes de sincronizar."""
    rows = db.execute(
        select(Record.kind, func.count())
        .where(Record.user_id == user.id, Record.deleted.is_(False))
        .group_by(Record.kind)
    ).all()
    return {"revision": user.revision, "records": {kind: total for kind, total in rows}}
