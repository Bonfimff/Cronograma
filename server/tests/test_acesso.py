"""Professor só vê o histórico de quem o autorizou, e só enquanto durar a autorização."""


def test_professor_le_so_com_autorizacao(client, conta):
    aluno, prof = conta(), conta("prof@exemplo.com")
    aluno.push([{"kind": "activity", "id": "at-1", "data": {"origem": "tetris"}}])
    eu = client.get("/auth/me", headers=prof.headers).json()
    aluno_id = client.get("/auth/me", headers=aluno.headers).json()["id"]

    assert client.get(f"/acesso/alunos/{aluno_id}", headers=prof.headers).status_code == 403

    r = client.post("/acesso", json={"email": eu["email"]}, headers=aluno.headers)
    assert r.status_code == 201 and r.json()["professores"][0]["email"] == eu["email"]
    assert client.get("/acesso", headers=prof.headers).json()["alunos"][0]["id"] == aluno_id

    itens = client.get(f"/acesso/alunos/{aluno_id}", headers=prof.headers).json()
    assert any(i["kind"] == "activity" for i in itens)

    client.delete(f"/acesso/{eu['id']}", headers=aluno.headers)
    assert client.get(f"/acesso/alunos/{aluno_id}", headers=prof.headers).status_code == 403


def test_email_sem_conta(client, conta):
    assert client.post("/acesso", json={"email": "ninguem@exemplo.com"}, headers=conta().headers).status_code == 404
