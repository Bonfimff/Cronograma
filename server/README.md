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

`sqlite` no desenvolvimento, sem instalar nada. Em produção, troque a `ENGLISH_DATABASE_URL`:

```
mysql+pymysql://ingles:SENHA@127.0.0.1:3306/ingles?charset=utf8mb4
postgresql+psycopg://ingles:SENHA@127.0.0.1:5432/ingles
```

O driver do MySQL (`pymysql`) já vem nas dependências. Para preparar o banco, use o script — ele
pergunta as senhas na hora (nada vai parar no histórico do terminal), cria banco e usuário, grava a
URL no `.env` e só termina depois de conectar de verdade:

```bash
bash deploy/preparar-mysql.sh            # ou: bash deploy/preparar-mysql.sh <banco> <usuario>
```

Se o root do MySQL entra pelo socket (`sudo mysql`), ele usa isso; senão, pede a senha do root.

Cuidados que já estão no código: `utf8mb4` na conexão (senão acentos e emoji se perdem),
`pool_recycle` de 30 min (o MySQL derruba conexões ociosas e a primeira requisição do dia
morreria) e o e-mail limitado a 254 caracteres, para o índice único caber com folga no InnoDB.

As tabelas são criadas na subida; quando o modelo começar a mudar em produção, entra o Alembic.

## O que ainda falta

- Ligar o aplicativo ao servidor (hoje ele só grava no `localStorage`).
- Recuperação de senha por e-mail.
- Limite de tentativas de login.
- Migrações (Alembic) e implantação.

## Publicar uma versão nova

Na sua máquina (PowerShell), empacote e envie:

```powershell
tar -czf $env:TEMP\ingles-server.tgz -C E:\Cronograma --exclude=.venv --exclude=__pycache__ --exclude=.pytest_cache --exclude=*.db --exclude=.env server
scp -i $HOME\Downloads\chave.key $env:TEMP\ingles-server.tgz ubuntu@SERVIDOR:/tmp/
ssh -i $HOME\Downloads\chave.key ubuntu@SERVIDOR 'tar -xzf /tmp/ingles-server.tgz -C ~/ingles && bash ~/ingles/server/deploy/atualizar.sh'
```

O `.env` do servidor fica de fora do pacote, então as senhas de lá não são sobrescritas.
Escreva os comandos remotos **entre aspas simples**: o PowerShell come as aspas duplas antes de
o servidor vê-las.
