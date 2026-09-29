# Inglês Híbrido — API

Backend do app de estudo: **contas** (e-mail e senha) e **sincronização entre aparelhos**.
O aplicativo continua funcionando sozinho no navegador; o servidor guarda uma cópia do que
já foi estudado e entrega para os outros aparelhos da mesma conta.

```
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt     # Linux/Mac: .venv/bin/pip
cp .env.example .env                                  # ajuste a chave e o banco
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8010
.venv/Scripts/python -m pytest                        # testes
```

Documentação interativa (gerada pelo FastAPI): <http://localhost:8010/docs>.

## Como a sincronização funciona

Cada conta tem um contador de **revisão** que só cresce. Toda gravação recebe a revisão
seguinte. O aparelho guarda a última revisão que viu e pergunta *"o que mudou depois disso?"* —
recebe só a diferença, nunca o banco inteiro.

```
celular  ──push(since=3, [sessão, histórico])──▶  servidor (revisão 3 → 5)
celular  ◀──── revisão 5 + o que mudou ──────────
computador ──pull(since=3)──▶  recebe as mesmas duas mudanças, fica na revisão 5
```

- **Conflito** (o mesmo registro alterado em dois aparelhos): vence quem gravou por último.
  Quem estava atrasado tem o envio recusado (`ignored`) e recebe a versão do servidor na mesma
  resposta — aí regrava, se ainda quiser.
- **Apagar** não some com a linha: marca `deleted`, para o outro aparelho ficar sabendo.
- O servidor **não conhece o formato** do conteúdo: guarda o mesmo JSON que o app já usa. O
  formato pode evoluir no app sem migração aqui.

Tipos sincronizados (`kind`): `week`, `session`, `worksheet`, `history`, `sheet`, `content`, `game`.

## Rotas

| Método | Rota | Para quê |
|---|---|---|
| POST | `/auth/register` | criar conta (devolve os tokens) |
| POST | `/auth/login` | entrar |
| POST | `/auth/refresh` | renovar o token de acesso |
| POST | `/auth/logout-all` | desconectar todos os aparelhos |
| GET | `/auth/me` | conta atual e quanto há guardado |
| POST | `/sync/push` | enviar alterações |
| GET | `/sync/pull?since=N` | receber o que mudou |
| GET | `/sync/status` | quanto o servidor tem, por tipo |
| GET | `/saude` | o serviço está de pé? |

O token de acesso vai no cabeçalho `Authorization: Bearer …` (não em cookie — o app roda em
outro domínio).

## Segurança

- Senha guardada só como hash **Argon2id**; o texto nunca entra no banco.
- E-mail inexistente e senha errada devolvem **a mesma** resposta, para não revelar quem tem conta.
- Token de acesso curto (30 min) e de renovação longo (60 dias), com uma "época" por usuário:
  `logout-all` invalida todos de uma vez.
- Um token de renovação não serve como token de acesso.
- CORS restrito às origens do `.env`.

## Banco

`sqlite` no desenvolvimento, sem instalar nada. Em produção, troque a `ENGLISH_DATABASE_URL` por
um Postgres (`postgresql+psycopg://…`) e instale `psycopg[binary]`. As tabelas são criadas na
subida; quando o modelo começar a mudar em produção, entra o Alembic.

## O que ainda falta

- Ligar o aplicativo ao servidor (hoje ele só grava no `localStorage`).
- Recuperação de senha por e-mail.
- Limite de tentativas de login.
- Migrações (Alembic) e implantação.
