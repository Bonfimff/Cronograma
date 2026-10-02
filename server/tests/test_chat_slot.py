"""O chat no modo "slot": o modelo marca a palavra em português e o servidor troca por inglês."""

import json
import urllib.error
from datetime import date, timedelta

from app import chat_slot, config, conhecimento
from app.chat_slot import (
    aplicar_troca,
    completar_trocas,
    escolhidas,
    esquema,
    instrucao,
    limpar_abertura,
    lista_despejada,
    pergunta_repetida,
    sanear_historico,
)
from app.routers import chat
from app.vocabulario import Palavra


def P(en: str, pt: str, peso: float = 1.0) -> Palavra:
    return Palavra(id=f"words:{en}", en=en, pt=pt, peso=peso)


VOCAB = [P("tired", "cansado"), P("house", "casa"), P("coffee", "café"), P("exhausted", "cansado"), P("busy", "ocupado")]


def _fala(*textos):
    return [{"role": "user" if i % 2 == 0 else "assistant", "content": t} for i, t in enumerate(textos)]


# --- o módulo, sem rede -----------------------------------------------------------------------


def test_traducao_repetida_entra_uma_vez_so_no_esquema():
    enum = esquema(VOCAB)["properties"]["trocar"]["items"]["enum"]
    assert enum == ["cansado", "casa", "café", "ocupado"]
    assert [p.en for p in escolhidas(VOCAB)] == ["tired", "house", "coffee", "busy"]


def test_sem_palavras_o_esquema_nao_aceita_troca():
    assert esquema([])["properties"]["trocar"]["maxItems"] == 0
    assert "has not studied any word" in instrucao([])


def test_a_instrucao_lista_as_palavras_em_portugues():
    assert "cansado, casa, café, ocupado" in instrucao(VOCAB)


def test_troca_respeita_fronteira_de_palavra_e_caixa():
    texto, feitas = aplicar_troca("Que casaco bonito! A Casa está limpa.", ["casa"], VOCAB)
    assert texto == "Que casaco bonito! A House está limpa."  # "casaco" ficou; a caixa da palavra original é mantida
    assert feitas == ["casa"]


def test_troca_ignora_palavra_que_nao_aparece_ou_nao_e_da_lista():
    texto, feitas = aplicar_troca("Vamos tomar um café.", ["casa", "viagem"], VOCAB)
    assert texto == "Vamos tomar um café." and feitas == []


def test_em_empate_de_traducao_vale_a_ficha_mais_urgente():
    texto, _ = aplicar_troca("Estou cansado.", ["cansado"], VOCAB)
    assert texto == "Estou tired."  # "tired" vem antes de "exhausted" na lista


def test_detecta_lista_despejada():
    assert lista_despejada("Aqui está: cansado, casa, café, ocupado.", VOCAB)
    assert not lista_despejada("Estou cansado e quero um café.", VOCAB)


def test_detecta_pergunta_repetida():
    antes = ["Legal! Como está o seu trabalho?"]
    assert pergunta_repetida("Entendi. Como está o seu trabalho?", antes)
    assert not pergunta_repetida("Entendi. O que você vai fazer amanhã?", antes)


def test_completar_trocas_usa_a_palavra_do_dia_que_ja_esta_no_texto():
    texto, feitas = completar_trocas("Vou tomar um café em casa.", [], VOCAB, 1)
    assert texto == "Vou tomar um café em house." and feitas == ["casa"]  # a mais urgente que aparece: "casa"
    # já chegou ao mínimo: não mexe
    assert completar_trocas("Vou tomar um café.", ["cansado"], VOCAB, 1) == ("Vou tomar um café.", ["cansado"])
    # nenhuma palavra do dia no texto: não força
    assert completar_trocas("Que legal!", [], VOCAB, 1) == ("Que legal!", [])


def test_limpar_abertura_corta_o_entendi_mas_so_quando_sobra_resposta():
    assert limpar_abertura("Entendi! Que legal, boa sorte.") == "Que legal, boa sorte."
    assert limpar_abertura("Peço desculpas pelo erro! Sou o Amigo de treino.") == "Sou o Amigo de treino."
    assert limpar_abertura("Entendi!") == "Entendi!"  # só a abertura: não deixa a resposta vazia
    assert limpar_abertura("Claro! Vamos nessa.") == "Claro! Vamos nessa."  # "Claro" pode ser resposta de verdade


def test_o_historico_saneado_troca_a_promessa_de_memoria_por_uma_frase_verdadeira():
    historico = _fala("Grava isso?", "Sim, foi gravada definitivamente em minha base de conhecimento.", "Oi", "Oi, tudo bem?")
    limpo = sanear_historico(historico)
    assert limpo[1]["content"] == chat_slot.HONESTA
    assert limpo[0] == historico[0] and limpo[3] == historico[3]  # o resto passa intacto
    assert historico[1]["content"].startswith("Sim")  # o original (o que aparece na tela) não é alterado


# --- o que o amigo sabe do app --------------------------------------------------------------


def test_o_guia_cobre_todas_as_telas_e_jogos():
    for nome in ("Hoje", "Semana", "Revisão", "Conteúdo", "Jogos", "Meu progresso", "Ajustes", "Backup dos dados",
                 "Tetris", "Ligar palavras", "Cruzadas", "Flashcards", "Amigo de treino"):
        assert nome in conhecimento.GUIA, nome


def test_o_guia_diz_quem_e_o_app_quem_o_fez_e_o_que_o_chat_nao_faz():
    for trecho in ("Eita", "Inglês Híbrido", "Exksvol Systems", "Felipe Bonfim Flausino", "Limpar histórico",
                   "não grava nada de forma permanente", "não consegue adicionar palavras"):
        assert trecho in conhecimento.GUIA, trecho


def test_as_regras_proibem_prometer_memoria_e_repetir_a_pessoa():
    texto = " ".join(instrucao(VOCAB).split())  # a instrução quebra linha no meio das frases
    assert "Never repeat the person's sentence back" in texto
    assert "you cannot save or learn anything permanently" in texto and "look anything up" in texto


def test_as_notas_do_app_vao_antes_das_palavras_do_dia():
    texto = instrucao(VOCAB, sobre_o_app="NOTA-DO-APP")
    assert "NOTA-DO-APP" in texto
    assert texto.index("NOTA-DO-APP") < texto.index("cansado, casa")  # o que muda a cada turno vai por último
    assert "APP NOTES" not in instrucao(VOCAB)  # sem notas, sem o bloco


def test_reconhece_pergunta_sobre_o_app():
    for pergunta in ("O que tem na aba Jogos?", "Como faço backup dos meus dados?", "O app tem modo escuro?",
                     "Quantas palavras eu estudo?", "Qual é o meu recorde no Tetris?", "Posso usar sem conta?",
                     "Quais são os estados de revisão?", "Vc consegue ver a minha lista de vocabulário?",
                     "Como funciona a folha com QR Code?"):
        assert conhecimento.pergunta_sobre_o_app(_fala(pergunta)), pergunta


def test_bate_papo_nao_liga_o_guia():
    for fala in ("Oi! Tudo bem?", "Me conta uma novidade", "Hoje foi um dia corrido", "Gosto de tomar café de manhã",
                 "Estou meio cansado, trabalhei o dia inteiro", "Como se fala oi em inglês?",
                 "Vou ficar em casa no fim de semana", "Tô pensando em aprender a cozinhar"):
        assert not conhecimento.pergunta_sobre_o_app(_fala(fala)), fala


def test_pergunta_de_seguimento_mantem_o_guia_por_mais_uma_fala():
    assert conhecimento.pergunta_sobre_o_app(_fala("O que tem na aba Jogos?", "Quatro jogos.", "E qual é o mais difícil?"))
    # duas falas depois, a conversa já mudou de assunto
    assert not conhecimento.pergunta_sobre_o_app(
        _fala("O que tem na aba Jogos?", "Quatro jogos.", "Legal", "Ok.", "Gosto de café", "Eu também!", "E você?"))


# --- respostas diretas: perguntas que vieram do uso real ------------------------------------------


def _direta(texto):
    """As respostas fixas não consultam o banco, então não precisam de sessão."""
    return conhecimento.resposta_direta(None, None, _fala(texto))


def test_perguntas_sobre_memoria_recebem_a_resposta_verdadeira():
    for pergunta in ("E vc consegue aprender de forma definitiva com as conversas?",
                     "Mas consegue gravar de forma definitiva uma informação para esse chet?",
                     "Se limpar o histórico desse chat vc vai esquecer essa informação?",
                     "Pode adicionar de forma definitiva", "Já foi gravada definitivamente?"):
        resposta = _direta(pergunta)
        assert resposta and "não consigo gravar nada de forma permanente" in resposta, pergunta


def test_perguntas_sobre_o_app_e_o_amigo_recebem_a_resposta_pronta():
    assert "Exksvol Systems" in _direta("Quem foi o criador desse app?")
    assert "Felipe Bonfim Flausino" in _direta("quem criou o app?")
    assert "Tetris, Ligar palavras, Cruzadas e Flashcards" in _direta("Quero jogar. Quais são os jogos que tem ?")
    assert "Backup dos dados" in _direta("Como faço backup?")
    assert "Amigo de treino" in _direta("Como vc se chama?")
    assert "IA pequena" in _direta("Qual é o seu modelo de linguagem?")
    assert "não busco nada na internet" in _direta("Qual é a previsão do tempo para amanhã no rio de janeiro")
    assert "não busco nada na internet" in _direta("Eu quero saber se vai chover. Consegue me passar essa informação?")
    assert "adicionar palavras" in _direta("adiciona a palavra Hi a minha lista de vocabulario")
    assert "outras pessoas" in _direta("Essa informação fica responsável para outros usuários ou só para mim?")


def test_conversa_comum_nao_dispara_resposta_pronta():
    for fala in ("Sou o desenvolvedor desse projeto", "Estou trabalhando no desenvolvimento do Eita, esse app que estamos",
                 "Preciso lembrar de comprar pão", "Gosto de tomar café de manhã", "Vou jogar bola hoje",
                 "Oi! Tudo bem?", "Estou meio cansado, trabalhei o dia inteiro", "Bye bye", "Pode verificar"):
        assert _direta(fala) is None, fala


# --- a rota ------------------------------------------------------------------------------------

PALAVRA = {"kind": "content", "id": "words:rest", "data": {"word": "rest", "translations": [{"text": "descansar"}]}}
MENSAGEM = {"messages": [{"role": "user", "content": "Estou muito cansado hoje"}]}
PERGUNTA_APP = {"messages": [{"role": "user", "content": "Como funciona a folha com QR Code?"}]}


def _resposta(texto: str) -> dict:
    return {"texto": texto, "trocadas": [], "tentativas": 1, "problema": None}


def _nao_deveria(*args, **kwargs):
    raise AssertionError("esta pergunta tem resposta pronta: o modelo não podia ser chamado")


def test_modo_slot_marca_a_palavra_trocada_e_devolve_o_glossario(client, conta, monkeypatch):
    a = conta()
    a.push([PALAVRA])
    vistas = {}

    def falso(url, modelo, historico, palavras, limite, timeout, **extra):
        vistas.update(historico=historico, palavras=[p.en for p in palavras])
        return _resposta("Vai descansar um pouco? Eu preciso de um rest também.")

    monkeypatch.setattr(chat, "responder", falso)
    r = client.post("/chat", json=MENSAGEM, headers=a.headers)
    assert r.status_code == 200, r.text
    assert "[[rest]]" in r.json()["reply"]
    assert r.json()["glossary"][0]["en"] == "rest"
    assert vistas["palavras"] == ["rest"]  # o vocabulário do banco chegou ao módulo
    assert vistas["historico"] == [{"role": "user", "content": "Estou muito cansado hoje"}]


def test_modo_livre_volta_ao_comportamento_anterior(client, conta, monkeypatch):
    monkeypatch.setenv("ENGLISH_CHAT_MODO", "livre")
    config.settings.cache_clear()
    a = conta()
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    monkeypatch.setattr(chat, "_pedir", lambda mensagens, limite: "Tudo bem por aqui, e você?")
    r = client.post("/chat", json=MENSAGEM, headers=a.headers)
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "Tudo bem por aqui, e você?"
    # no modo livre também não há respostas prontas: é o comportamento de antes, inteiro
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Quem criou o app?"}]}, headers=a.headers)
    assert r.json()["reply"] == "Tudo bem por aqui, e você?"


def test_modelo_fora_do_ar_vira_503(client, conta, monkeypatch):
    a = conta()

    def cai(*args, **kwargs):
        raise urllib.error.URLError("sem túnel")

    monkeypatch.setattr(chat, "responder", cai)
    assert client.post("/chat", json=MENSAGEM, headers=a.headers).status_code == 503


def test_resposta_do_modelo_ilegivel_vira_502(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(chat, "responder", lambda *args, **kwargs: {})  # sem "texto"
    assert client.post("/chat", json=MENSAGEM, headers=a.headers).status_code == 502


def test_resposta_vazia_vira_503(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(chat, "responder", lambda *args, **kwargs: _resposta(""))
    assert client.post("/chat", json=MENSAGEM, headers=a.headers).status_code == 503


def test_se_continuou_em_ingles_entrega_sem_marcar(client, conta, monkeypatch):
    a = conta()
    a.push([PALAVRA])
    monkeypatch.setattr(chat, "responder",
                        lambda *args, **kwargs: _resposta("How are you doing today? That is great to hear, you rest."))
    r = client.post("/chat", json=MENSAGEM, headers=a.headers)
    assert r.status_code == 200
    assert "[[" not in r.json()["reply"] and r.json()["glossary"] == []


def test_a_resposta_pronta_nao_chama_o_modelo(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Quais são os jogos que tem?"}]}, headers=a.headers)
    assert r.status_code == 200
    assert "Tetris, Ligar palavras, Cruzadas e Flashcards" in r.json()["reply"]


def test_o_amigo_sabe_o_plano_de_hoje(client, conta, monkeypatch):
    hoje = date.today().isoformat()
    a = conta()
    a.push([
        {"kind": "week", "id": "2026-09-28", "data": {"id": "2026-09-28", "goals": "", "days": [
            {"date": hoje, "theme": "Cumprimentos", "objective": "Perguntar como alguém está"},
            {"date": "2000-01-01", "theme": "Outro dia", "objective": "x"}]}},
        {"kind": "session", "id": "ENG-1", "data": {"id": "ENG-1", "date": hoje, "title": "How are you?"}},
        {"kind": "session", "id": "ENG-2", "data": {"id": "ENG-2", "date": hoje, "title": "Presente simples", "finishedAt": "x"}},
    ])
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Qual é o tema da minha aula de hj ?"}]}, headers=a.headers)
    resposta = r.json()["reply"]
    assert "Hoje o tema é Cumprimentos: Perguntar como alguém está." in resposta
    assert "How are you? (a fazer)" in resposta and "Presente simples (feita)" in resposta
    assert "Outro dia" not in resposta


def test_sem_plano_de_hoje_ele_diz_que_nao_achou(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "Qual é o tema da minha aula de hoje?"}]}, headers=a.headers)
    assert r.json()["reply"] == "Não achei um plano para hoje no app."


def test_a_lista_de_vocabulario_vem_do_banco_com_as_palavras_marcadas(client, conta, monkeypatch):
    a = conta()
    a.push([PALAVRA, {"kind": "content", "id": "words:work", "data": {"word": "work", "translations": [{"text": "trabalhar"}]}}])
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "qual é a minha  lista de vocabulario ?"}]}, headers=a.headers)
    assert r.status_code == 200
    resposta = r.json()["reply"]
    assert "Você tem 2 palavras no vocabulário." in resposta
    assert "[[rest]]" in resposta and "[[work]]" in resposta  # as palavras viram palavras vivas na tela


def test_vocabulario_vazio_e_recordes(client, conta, monkeypatch):
    a = conta()
    monkeypatch.setattr(chat, "responder", _nao_deveria)
    r = client.post("/chat", json={"messages": [{"role": "user", "content": "qual é a minha lista de vocabulário?"}]}, headers=a.headers)
    assert r.json()["reply"] == "Você ainda não tem palavras no vocabulário."
    pergunta = {"messages": [{"role": "user", "content": "Qual é o meu recorde no Tetris?"}]}
    assert client.post("/chat", json=pergunta, headers=a.headers).json()["reply"] == "Ainda não achei recordes seus nos jogos."
    a.push([{"kind": "game", "id": "word-tetris-best", "data": {"value": "1850"}}])
    assert client.post("/chat", json=pergunta, headers=a.headers).json()["reply"] == "Seus recordes: Tetris 1850."


def test_o_chat_recebe_o_guia_e_o_resumo_de_quem_conversa(client, conta, monkeypatch):
    a = conta()
    cinco_dias_atras = (date.today() - timedelta(days=5)).isoformat()
    a.push([
        PALAVRA,
        {"kind": "content", "id": "words:work", "data": {"word": "work", "translations": [{"text": "trabalhar"}]}},
        {"kind": "history", "id": "h1", "data": {"ref": "word:rest", "event": "review_needed", "date": cinco_dias_atras}},
        {"kind": "game", "id": "word-tetris-best", "data": {"value": "1850"}},
    ])
    visto = {}

    def falso(url, modelo, historico, palavras, limite, timeout, **extra):
        visto.update(extra)
        return _resposta("Tudo certo por aqui.")

    monkeypatch.setattr(chat, "responder", falso)
    assert client.post("/chat", json=PERGUNTA_APP, headers=a.headers).status_code == 200
    notas = visto["sobre_o_app"]
    assert conhecimento.GUIA in notas
    assert "2 palavras no vocabulário, 1 pedindo revisão" in notas
    assert "último estudo há 5 dia(s)" in notas
    assert "Tetris 1850" in notas


def test_quem_nao_estudou_nada_ouve_so_o_guia(client, conta, monkeypatch):
    a = conta()
    visto = {}
    monkeypatch.setattr(chat, "responder", lambda *args, **extra: visto.update(extra) or _resposta("Oi!"))
    assert client.post("/chat", json=PERGUNTA_APP, headers=a.headers).status_code == 200
    assert visto["sobre_o_app"] == conhecimento.GUIA


def test_bate_papo_comum_nao_leva_o_guia(client, conta, monkeypatch):
    a = conta()
    a.push([PALAVRA])
    visto = {}
    monkeypatch.setattr(chat, "responder", lambda *args, **extra: visto.update(extra) or _resposta("Oi!"))
    assert client.post("/chat", json=MENSAGEM, headers=a.headers).status_code == 200
    assert visto["sobre_o_app"] == ""  # sem pergunta sobre o app, o guia fica de fora


def test_o_minimo_de_trocas_vem_da_configuracao(client, conta, monkeypatch):
    a = conta()
    visto = {}
    monkeypatch.setattr(chat, "responder", lambda *args, **extra: visto.update(extra) or _resposta("Oi!"))
    client.post("/chat", json=MENSAGEM, headers=a.headers)
    assert visto["minimo_trocas"] == 1  # padrão: toda resposta troca ao menos uma palavra, se couber
    monkeypatch.setenv("ENGLISH_CHAT_TROCAS_MINIMO", "0")
    config.settings.cache_clear()
    client.post("/chat", json=MENSAGEM, headers=a.headers)
    assert visto["minimo_trocas"] == 0


# --- as guardas, com um modelo de mentira ------------------------------------------------------


def _roteiro(monkeypatch, *respostas):
    """Troca o Ollama por uma lista de respostas (reply, trocar); devolve o que o modelo recebeu."""
    fila, recebido = list(respostas), []

    def falso(url, modelo, sistema, historico, palavras, limite, temperatura, seed, timeout):
        recebido.append({"sistema": sistema, "historico": historico})
        return fila.pop(0)

    monkeypatch.setattr(chat_slot, "_chamar", falso)
    return recebido


HISTORICO = [{"role": "user", "content": "Sou o desenvolvedor desse projeto"}]


def test_pede_de_novo_quando_promete_memoria(monkeypatch):
    recebido = _roteiro(monkeypatch, ("Pode deixar, foi gravada definitivamente.", []), ("Legal, boa sorte com o app!", []))
    r = chat_slot.responder("u", "m", HISTORICO, VOCAB)
    assert r["texto"] == "Legal, boa sorte com o app!" and r["tentativas"] == 2 and r["problema"] is None
    assert "previous reply was rejected" in recebido[1]["sistema"]  # a segunda tentativa avisa o modelo


def test_o_modelo_nunca_ve_a_promessa_de_memoria_do_historico(monkeypatch):
    recebido = _roteiro(monkeypatch, ("Boa pergunta!", []))
    historico = _fala("Grava isso?", "Sim, foi gravada definitivamente.", "E agora?")
    chat_slot.responder("u", "m", historico, VOCAB)
    assert recebido[0]["historico"][1]["content"] == chat_slot.HONESTA


def test_pede_de_novo_quando_so_repete_a_pessoa(monkeypatch):
    _roteiro(monkeypatch, ("Você é o desenvolvedor desse projeto. Que legal!", []), ("Que legal, desde quando?", []))
    r = chat_slot.responder("u", "m", HISTORICO, VOCAB)
    assert r["texto"] == "Que legal, desde quando?" and r["tentativas"] == 2


def test_com_minimo_o_servidor_completa_a_troca_sem_chamar_o_modelo_de_novo(monkeypatch):
    _roteiro(monkeypatch, ("Estou cansado hoje.", []))
    r = chat_slot.responder("u", "m", [{"role": "user", "content": "Oi"}], VOCAB, minimo_trocas=1)
    assert r["texto"] == "Estou tired hoje." and r["trocadas"] == ["cansado"] and r["tentativas"] == 1


def test_sem_minimo_nao_troca_o_que_o_modelo_nao_marcou(monkeypatch):
    _roteiro(monkeypatch, ("Estou cansado hoje.", []))
    r = chat_slot.responder("u", "m", [{"role": "user", "content": "Oi"}], VOCAB)
    assert r["texto"] == "Estou cansado hoje." and r["trocadas"] == []


def test_com_minimo_mas_sem_palavra_no_texto_nao_forca(monkeypatch):
    _roteiro(monkeypatch, ("Que legal!", []))
    r = chat_slot.responder("u", "m", [{"role": "user", "content": "Oi"}], VOCAB, minimo_trocas=1)
    assert r["texto"] == "Que legal!" and r["trocadas"] == []


def test_sem_vocabulario_nao_ha_o_que_trocar(monkeypatch):
    _roteiro(monkeypatch, ("Estou bem.", []))
    r = chat_slot.responder("u", "m", [{"role": "user", "content": "Oi"}], [], minimo_trocas=1)
    assert r["tentativas"] == 1 and r["problema"] is None


def test_a_abertura_vazia_e_cortada_na_resposta_final(monkeypatch):
    _roteiro(monkeypatch, ("Entendi! Que dia longo, hein.", []))
    r = chat_slot.responder("u", "m", [{"role": "user", "content": "Trabalhei o dia todo"}], VOCAB)
    assert r["texto"] == "Que dia longo, hein."


def test_se_o_defeito_persiste_devolve_o_problema_e_nao_trava(monkeypatch):
    _roteiro(monkeypatch, ("Já salvei tudo!", []), ("Salvei de forma definitiva!", []))
    r = chat_slot.responder("u", "m", HISTORICO, VOCAB)
    assert r["tentativas"] == 2 and r["problema"] == "memoria" and r["texto"]


def test_a_troca_no_inicio_da_frase_sai_com_maiuscula():
    voc = [P("how", "como"), P("you", "você")]
    texto, feitas = aplicar_troca("Como você está? Eu estou bem, e você?", ["como", "você"], voc)
    assert texto == "How you está? Eu estou bem, e você?" and feitas == ["como", "você"]  # só a 1ª ocorrência de cada
    assert aplicar_troca("Você está bem?", ["você"], voc)[0] == "You está bem?"  # abre a frase: maiúscula
    assert aplicar_troca("Eu sei como é.", ["como"], voc)[0] == "Eu sei how é."  # no meio: minúscula


def test_detecta_quando_o_modelo_cita_a_propria_instrucao():
    for frase in ("Posso apenas responder com base nos Rule 1 a 5", "Segundo as APP NOTES, são cinco telas",
                  'O campo "trocar" está vazio'):
        assert chat_slot.vazou_a_instrucao(frase), frase
    assert not chat_slot.vazou_a_instrucao("Que regra chata! Vamos trocar de assunto?")


def test_pede_de_novo_quando_vaza_a_instrucao(monkeypatch):
    _roteiro(monkeypatch, ("Com base nos Rule 1 a 5, não posso.", []), ("Não posso, mas vamos conversar!", []))
    r = chat_slot.responder("u", "m", HISTORICO, VOCAB)
    assert r["texto"] == "Não posso, mas vamos conversar!" and r["tentativas"] == 2


def test_so_as_ultimas_falas_vao_ao_modelo_e_a_janela_comeca_numa_fala_da_pessoa(monkeypatch):
    recebido = _roteiro(monkeypatch, ("Oi!", []))
    historico = [{"role": "user" if i % 2 == 0 else "assistant", "content": f"fala {i}"} for i in range(31)]
    chat_slot.responder("u", "m", historico, VOCAB)
    enviado = recebido[0]["historico"]
    assert len(enviado) <= chat_slot.MAX_HISTORICO and enviado[0]["role"] == "user"
    assert enviado[-1]["content"] == "fala 30"  # a última fala da pessoa nunca fica de fora


def test_escape_invalido_no_json_do_modelo_nao_derruba_a_resposta():
    # aconteceu de verdade: "Invalid \uXXXX escape" no meio do texto
    dados = chat_slot._ler_json('{"reply": "Oi \\u00zz tudo bem?", "trocar": ["casa", "café"]}')
    assert dados == {"reply": "Oi u00zz tudo bem?", "trocar": ["casa", "café"]}
    assert chat_slot._ler_json('{"reply": "Olá!", "trocar": []}') == {"reply": "Olá!", "trocar": []}  # JSON bom passa intacto
    assert chat_slot._ler_json('{"reply": "Disse \\"oi\\" \\u00e9", "trocar": []}')["reply"] == 'Disse "oi" é'
    try:
        chat_slot._ler_json("isto não é json")
    except ValueError:  # JSONDecodeError é um ValueError: lixo de verdade continua sendo erro
        pass
    else:
        raise AssertionError("lixo não podia ser aceito")


def test_json_cortado_no_meio_de_um_escape_devolve_ate_a_ultima_frase_inteira():
    # o caso do uso real: o modelo escreveu acentos como é, estourou o limite e o JSON parou no meio de um deles
    cortado = ('{"reply": "Sim, posso fazer isso. Vou usar as palavras do vocabul\\u00e1rio. '
               'Qual \\u00e9 a pr\\u00f3xima perg\\u00')
    dados = chat_slot._ler_json(cortado)
    assert dados == {"reply": "Sim, posso fazer isso. Vou usar as palavras do vocabulário.", "trocar": []}
    # curto demais para cortar numa frase: devolve o que veio, sem o escape pendurado
    assert chat_slot._ler_json('{"reply": "Oi, tudo bem com voc\\u00')["reply"] == "Oi, tudo bem com voc"


def test_o_limite_de_geracao_deixa_folga_para_os_escapes_unicode(monkeypatch):
    enviado = {}

    class Resposta:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"message": {"content": '{"reply": "Oi!", "trocar": []}'}}).encode("utf-8")

    def falso_urlopen(req, timeout=None):
        enviado.update(json.loads(req.data.decode("utf-8")))
        return Resposta()

    monkeypatch.setattr(chat_slot.urllib.request, "urlopen", falso_urlopen)
    chat_slot._chamar("http://x", "m", "sistema", HISTORICO, VOCAB, 200, 0.3, None, 5)
    assert enviado["options"]["num_predict"] >= 320


def test_promessa_de_memoria_com_tentar():
    assert chat_slot.promete_memoria("Agora vou tentar lembrar tudo!")
    assert chat_slot.promete_memoria("Pode deixar, vou lembrar disso.")
    assert not chat_slot.promete_memoria("Eu lembro dessa conversa enquanto ela estiver na tela.")


def test_o_modo_padrao_e_slot(monkeypatch):
    monkeypatch.delenv("ENGLISH_CHAT_MODO", raising=False)
    config.settings.cache_clear()
    assert config.settings().chat_modo == "slot"
    config.settings.cache_clear()


def test_varrer_vocabulario_troca_palavras_do_vocabulario_inteiro():
    from app.chat_slot import varrer_vocabulario
    from app.vocabulario import Palavra

    vocab = [Palavra("words:rest", "rest", "descansar", 9.0), Palavra("words:work", "work", "trabalho", 8.0),
             Palavra("words:no", "no", "ou", 7.0), Palavra("words:day", "day", "dia", 6.0)]
    texto, feitas = varrer_vocabulario("Hoje o trabalho foi puxado, vá descansar um dia ou dois.", [], vocab, 3)
    assert texto == "Hoje o work foi puxado, vá rest um day ou dois."
    assert feitas == ["descansar", "trabalho", "dia"]  # "ou" tem 2 letras: não troca
    texto2, feitas2 = varrer_vocabulario("Hoje o trabalho foi puxado, vá descansar um dia.", [], vocab, 1)
    assert feitas2 == ["descansar"] and "trabalho" in texto2  # respeita o teto