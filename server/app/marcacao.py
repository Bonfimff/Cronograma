"""
A marcação das palavras em inglês na resposta.

O modelo é pequeno e não obedece formato com confiança: esquece os colchetes,
marca o que não devia, às vezes responde em inglês. Então a marcação não é
dele. Tiramos o que ele marcou e refazemos por comparação com o vocabulário do
banco, que é a única fonte confiável.

O texto sai com `[[palavra]]` e vem acompanhado do glossário, para o aplicativo
saber o que mostrar no balão ao tocar.
"""

import re
import unicodedata

from .vocabulario import Palavra

MARCA = re.compile(r"\[\[\s*([^\]]+?)\s*\]\]")
SOBRAS = re.compile(r"[\[\]]{1,2}")


def limpar(texto: str) -> str:
    """Tira as marcas que o modelo inventou, deixando o texto cru."""
    return SOBRAS.sub("", MARCA.sub(r"\1", texto)).strip()


def _chave(palavra: str) -> str:
    """Compara sem acento e sem maiúscula, para "Rest" casar com "rest"."""
    sem_acento = unicodedata.normalize("NFD", palavra)
    return "".join(c for c in sem_acento if unicodedata.category(c) != "Mn").lower()


# quantas marcas cabem numa resposta. Mais do que isso vira confete: a conversa
# some atrás do destaque e nenhuma palavra recebe atenção de verdade.
MAXIMO = 3


def marcar(texto: str, vocabulario: list[Palavra], maximo: int = MAXIMO) -> tuple[str, list[dict]]:
    """
    Devolve o texto com as palavras do vocabulário marcadas e o glossário com a
    tradução de cada uma. Expressões de várias palavras vêm primeiro, para
    "take off" não virar "take" solto, e só as primeiras marcas ficam.
    """
    cru = limpar(texto)
    if not cru or not vocabulario:
        return cru, []

    por_tamanho = sorted(vocabulario, key=lambda p: len(p.en), reverse=True)
    encontradas: dict[str, Palavra] = {}
    pedacos: list[tuple[int, int, str]] = []  # (inicio, fim, palavra marcada)
    tomado = [False] * len(cru)

    for p in por_tamanho:
        if not p.en.strip():
            continue
        # \b não serve para expressões com espaço nem para apóstrofo: montamos na mão
        padrao = re.compile(r"(?<![\w'])" + re.escape(p.en) + r"(?![\w'])", re.IGNORECASE)
        for achado in padrao.finditer(cru):
            inicio, fim = achado.span()
            if any(tomado[inicio:fim]):
                continue  # já faz parte de uma expressão maior
            for i in range(inicio, fim):
                tomado[i] = True
            pedacos.append((inicio, fim, achado.group(0)))
            encontradas[_chave(p.en)] = p

    if not pedacos:
        return cru, []

    pedacos.sort()
    # a mesma palavra marcada três vezes na frase não ajuda: fica a primeira
    vistas: set[str] = set()
    unicos: list[tuple[int, int, str]] = []
    for inicio, fim, achado in pedacos:
        chave = _chave(achado)
        if chave in vistas:
            continue
        vistas.add(chave)
        unicos.append((inicio, fim, achado))
    pedacos = unicos[:maximo]
    encontradas = {k: v for k, v in encontradas.items() if k in {_chave(p[2]) for p in pedacos}}
    saida: list[str] = []
    fim_anterior = 0
    for inicio, fim, achado in pedacos:
        saida.append(cru[fim_anterior:inicio])
        saida.append(f"[[{achado}]]")
        fim_anterior = fim
    saida.append(cru[fim_anterior:])

    glossario = [{"en": p.en, "pt": p.pt, "id": p.id} for p in encontradas.values()]
    return "".join(saida), glossario


ITEM = re.compile(r"^(•\s*)(.+?)(\s+\()", re.MULTILINE)


def marcar_lista(texto: str, vocabulario: list[Palavra]) -> tuple[str, list[dict]]:
    """
    Marca uma lista de vocabulário ("• work (trabalhar)", uma por linha): a palavra no
    começo de cada item, sem o limite de marcas da conversa. Só o começo do item é
    marcado, para "do" e "a" do português não virarem palavras em inglês.
    """
    por_chave = {_chave(p.en): p for p in vocabulario if p.en.strip()}
    achadas: dict[str, Palavra] = {}

    def troca(m: re.Match) -> str:
        p = por_chave.get(_chave(m.group(2)))
        if not p:
            return m.group(0)
        achadas[_chave(p.en)] = p
        return f"{m.group(1)}[[{m.group(2)}]]{m.group(3)}"

    marcado = ITEM.sub(troca, limpar(texto))
    return marcado, [{"en": p.en, "pt": p.pt, "id": p.id} for p in achadas.values()]