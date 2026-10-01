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


def marcar(texto: str, vocabulario: list[Palavra]) -> tuple[str, list[dict]]:
    """
    Devolve o texto com as palavras do vocabulário marcadas e o glossário com a
    tradução de cada uma. Expressões de várias palavras vêm primeiro, para
    "take off" não virar "take" solto.
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
    saida: list[str] = []
    fim_anterior = 0
    for inicio, fim, achado in pedacos:
        saida.append(cru[fim_anterior:inicio])
        saida.append(f"[[{achado}]]")
        fim_anterior = fim
    saida.append(cru[fim_anterior:])

    glossario = [{"en": p.en, "pt": p.pt, "id": p.id} for p in encontradas.values()]
    return "".join(saida), glossario
