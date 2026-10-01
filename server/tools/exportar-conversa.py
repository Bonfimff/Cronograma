"""
Tira do banco a conversa de uma conta, em texto, para análise.

Roda no servidor, onde o MySQL está:

    cd ~/ingles/server && .venv/bin/python tools/exportar-conversa.py seu@email.com > conversa.md

Sai um texto com quem falou, quando, e quais palavras do vocabulário apareceram
em cada resposta. É material para olhar a qualidade da conversa, não backup: o
backup é o da própria aplicação.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.marcacao import MARCA  # noqa: E402
from app.models import Record, User  # noqa: E402


def main(email: str) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            print(f"Não achei a conta {email}.", file=sys.stderr)
            return 1

        linhas = db.scalars(
            select(Record).where(
                Record.user_id == user.id,
                Record.kind == "chat",
                Record.deleted.is_(False),
            )
        ).all()

        falas = sorted((r.data or {} for r in linhas), key=lambda d: str(d.get("at") or ""))
        if not falas:
            print("Conversa vazia.", file=sys.stderr)
            return 1

        usadas: dict[str, int] = {}
        print(f"# Conversa de {email}\n")
        for f in falas:
            quem = "Amigo" if f.get("role") == "assistant" else "Pessoa"
            quando = str(f.get("at") or "")[:16].replace("T", " ")
            texto = str(f.get("content") or "")
            for palavra in MARCA.findall(texto):
                chave = palavra.lower()
                usadas[chave] = usadas.get(chave, 0) + 1
            print(f"**{quem}** ({quando}): {texto}\n")

        print("## Palavras em inglês que apareceram\n")
        for palavra, vezes in sorted(usadas.items(), key=lambda x: -x[1]):
            print(f"- {palavra}: {vezes}")
        print(f"\nTotal de falas: {len(falas)}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("uso: exportar-conversa.py EMAIL", file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
