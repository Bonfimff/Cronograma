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


def test_professor_monta_aula_e_agenda(client, conta):
    aluno, prof = conta(), conta("prof2@exemplo.com")
    eu = client.get("/auth/me", headers=prof.headers).json()
    aluno_id = client.get("/auth/me", headers=aluno.headers).json()["id"]
    aula = {"kind": "session", "id": "ENG-2026-0001", "data": {"title": "Aula 1"}}
    assert client.post(f"/acesso/alunos/{aluno_id}", json={"items": [aula]}, headers=prof.headers).status_code == 403

    client.post("/acesso", json={"email": eu["email"]}, headers=aluno.headers)
    marca = {"kind": "agenda", "id": "ag-1", "data": {"inicio": "2026-10-20T15:00"}}
    r = client.post(f"/acesso/alunos/{aluno_id}", json={"items": [aula, marca]}, headers=prof.headers)
    assert r.status_code == 200 and len(r.json()) == 2

    baixado = client.get("/sync/pull?since=0", headers=aluno.headers).json()["items"]
    assert {(i["kind"], i["id"]) for i in baixado} >= {("session", "ENG-2026-0001"), ("agenda", "ag-1")}

    historico = {"kind": "history", "id": "h-1", "data": {}}
    assert client.post(f"/acesso/alunos/{aluno_id}", json={"items": [historico]}, headers=prof.headers).status_code == 403


def test_professor_ve_disponibilidade_mas_nao_grava(client, conta):
    aluno, prof = conta(), conta("prof3@exemplo.com")
    eu = client.get("/auth/me", headers=prof.headers).json()
    aluno_id = client.get("/auth/me", headers=aluno.headers).json()["id"]
    client.post("/acesso", json={"email": eu["email"]}, headers=aluno.headers)
    aluno.push([{"kind": "disponibilidade", "id": "semana", "data": {"dias": {"seg": ["noite"]}}}])

    itens = client.get(f"/acesso/alunos/{aluno_id}", headers=prof.headers).json()
    assert any(i["kind"] == "disponibilidade" for i in itens)
    outra = {"kind": "disponibilidade", "id": "semana", "data": {}}
    assert client.post(f"/acesso/alunos/{aluno_id}", json={"items": [outra]}, headers=prof.headers).status_code == 403
