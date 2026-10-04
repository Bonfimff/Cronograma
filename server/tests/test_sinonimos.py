"""Induzir o chat às palavras que a pessoa já tem: sinônimo vira a palavra do vocabulário."""

from app.chat_slot import conhecidas, instrucao
from app.usar_vocabulario import usar_vocabulario
from app.vocabulario import Palavra

VOCAB = [
    Palavra(id="words:work", en="work", pt="trabalho / trabalhar", peso=3),
    Palavra(id="words:house", en="house", pt="casa", peso=2),
    Palavra(id="words:talk", en="talk", pt="conversar", peso=1),
]


def test_sinonimo_vira_a_palavra_do_vocabulario():
    texto, usadas = usar_vocabulario("Como foi o emprego hoje? Voltou cedo pra residência?", VOCAB)
    assert "work" in usadas and "house" in usadas
    assert "emprego" not in texto and "residência" not in texto


def test_traducao_direta_ganha_do_sinonimo():
    # "conversar" é tradução direta de talk: não vira work nem outra coisa
    _, usadas = usar_vocabulario("Vamos conversar depois.", VOCAB)
    assert usadas == ["talk"]


def test_sem_sinonimo_no_vocabulario_nada_muda():
    texto, usadas = usar_vocabulario("Comprei um automóvel.", VOCAB)
    assert usadas == [] and texto == "Comprei um automóvel."


def test_instrucao_lista_as_palavras_conhecidas():
    assert conhecidas(VOCAB) == ["trabalho", "casa", "conversar"]
    assert "WORDS THE PERSON ALREADY KNOWS" in instrucao(VOCAB, vocabulario=VOCAB)
    assert "WORDS THE PERSON ALREADY KNOWS" not in instrucao(VOCAB)
