def test_registrar_e_entrar(client):
    r = client.post("/auth/register", json={"email": "Eu@Exemplo.com", "password": "senha-bem-grande"})
    assert r.status_code == 201
    assert r.json()["access_token"]

    # o e-mail não diferencia maiúsculas
    r = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    assert r.status_code == 200
    token = r.json()["access_token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "eu@exemplo.com"
    assert r.json()["records"] == 0


def test_email_repetido_e_senha_errada(client):
    client.post("/auth/register", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    r = client.post("/auth/register", json={"email": "eu@exemplo.com", "password": "outra-senha-longa"})
    assert r.status_code == 409

    r = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": "senha-errada-x"})
    assert r.status_code == 401
    # a mesma resposta para quem não tem conta: não dá para descobrir quais e-mails existem
    r2 = client.post("/auth/login", json={"email": "ninguem@exemplo.com", "password": "senha-errada-x"})
    assert r2.status_code == 401 and r2.json() == r.json()


def test_senha_curta_e_email_invalido(client):
    assert client.post("/auth/register", json={"email": "eu@exemplo.com", "password": "curta"}).status_code == 422
    assert client.post("/auth/register", json={"email": "sem-arroba", "password": "senha-bem-grande"}).status_code == 422


def test_sem_token_e_com_token_falso(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer nao-e-um-token"}).status_code == 401


def test_renovar_e_sair_de_todos(client, conta):
    a = conta()
    r = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    refresh = r.json()["refresh_token"]

    novo = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert novo.status_code == 200 and novo.json()["access_token"]

    assert client.post("/auth/logout-all", headers=a.headers).status_code == 204
    # o refresh antigo não vale mais, nem o acesso que já estava na mão
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401
    assert client.get("/auth/me", headers=a.headers).status_code == 401


def test_token_de_renovacao_nao_serve_de_acesso(client):
    client.post("/auth/register", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    r = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    refresh = r.json()["refresh_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_senha_nao_e_guardada(client):
    from sqlalchemy import select
    from app import db as db_mod
    from app.models import User

    client.post("/auth/register", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    with db_mod.SessionLocal() as s:
        u = s.scalar(select(User))
        assert "senha-bem-grande" not in u.password_hash
        assert u.password_hash.startswith("$argon2")
