SESSAO = {
    "kind": "session",
    "id": "ENG-2026-0001",
    "data": {"title": "Perguntas com How", "refs": ["word:how"], "status": "planned"},
}


def test_enviar_e_receber_em_outro_aparelho(client, conta):
    celular = conta()
    celular.push([SESSAO])
    assert celular.revisao == 1

    from tests.conftest import Aparelho

    r = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    computador = Aparelho(client, r.json()["access_token"], "computador")

    vindo = computador.pull()
    assert [i["id"] for i in vindo["items"]] == ["ENG-2026-0001"]
    assert vindo["items"][0]["data"]["title"] == "Perguntas com How"
    # já na revisão do servidor: nada novo para trazer
    assert computador.pull()["items"] == []


def test_so_traz_o_que_mudou(client, conta):
    a = conta()
    a.push([SESSAO])
    a.push([{"kind": "sheet", "id": "folha-1", "data": {"title": "Trabalho", "items": []}}])
    depois = a.pull()
    assert depois["items"] == []

    a.push([{"kind": "history", "id": "h1", "data": {"ref": "word:how", "event": "new"}}])
    # um aparelho que parou na revisão 1 recebe só o que veio depois
    r = client.get("/sync/pull", params={"since": 1}, headers=a.headers)
    assert [i["id"] for i in r.json()["items"]] == ["folha-1", "h1"]


def test_apagar_avisa_o_outro_aparelho(client, conta):
    a = conta()
    a.push([SESSAO])
    outro_since = 0
    a.push([{**SESSAO, "data": {}, "deleted": True}])

    r = client.get("/sync/pull", params={"since": outro_since}, headers=a.headers)
    itens = r.json()["items"]
    assert len(itens) == 1 and itens[0]["deleted"] is True

    status = client.get("/sync/status", headers=a.headers).json()
    assert status["records"] == {}


def test_conflito_vence_quem_gravou_por_ultimo(client, conta):
    celular = conta()
    celular.push([SESSAO])

    from tests.conftest import Aparelho

    r = client.post("/auth/login", json={"email": "eu@exemplo.com", "password": "senha-bem-grande"})
    computador = Aparelho(client, r.json()["access_token"], "computador")
    computador.pull()  # fica na mesma revisão do celular

    # os dois mexem na mesma sessão; o computador grava primeiro
    computador.push([{**SESSAO, "data": {"title": "Editado no computador"}}])
    resposta = celular.push([{**SESSAO, "data": {"title": "Editado no celular"}}])

    # o celular estava atrasado: o envio dele é recusado e ele recebe a versão do servidor
    assert resposta["saved"] == 0 and resposta["ignored"] == 1
    assert resposta["items"][0]["data"]["title"] == "Editado no computador"

    # ciente da versão nova, ele regrava e agora vale a dele
    de_novo = celular.push([{**SESSAO, "data": {"title": "Editado no celular"}}])
    assert de_novo["saved"] == 1
    assert computador.pull()["items"][0]["data"]["title"] == "Editado no celular"


def test_cada_conta_ve_so_os_seus_dados(client, conta):
    a = conta("a@exemplo.com")
    b = conta("b@exemplo.com")
    a.push([SESSAO])
    assert b.pull()["items"] == []
    assert client.get("/sync/status", headers=b.headers).json()["records"] == {}


def test_precisa_estar_logado(client):
    assert client.get("/sync/pull").status_code == 401
    assert client.post("/sync/push", json={"since": 0, "items": []}).status_code == 401


def test_tipo_desconhecido_e_recusado(client, conta):
    a = conta()
    r = client.post(
        "/sync/push",
        json={"since": 0, "items": [{"kind": "qualquer", "id": "x", "data": {}}]},
        headers=a.headers,
    )
    assert r.status_code == 422


def test_conteudo_e_placares_tambem_sincronizam(client, conta):
    a = conta()
    a.push([
        {"kind": "content", "id": "user-content", "data": {"words": [{"id": "work", "word": "work"}]}},
        {"kind": "game", "id": "word-tetris-best", "data": {"value": "1850"}},
    ])
    status = client.get("/sync/status", headers=a.headers).json()
    assert status["records"] == {"content": 1, "game": 1}
