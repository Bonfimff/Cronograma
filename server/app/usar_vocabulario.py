"""
Usar o vocabulário da pessoa nas respostas do amigo: todas as palavras que couberem.

Pedido de quem usa o app (histórico de 04/10): "todas as palavras que tiverem no meu
vocabulário devem ser usadas nas mensagens". Antes, só palavras de conteúdo eram
trocadas (you, how, what ficavam de fora), uma tradução como "você / vocês" nunca
casava com "você", e cada resposta trocava no máximo 3.

Aqui a troca é por regras, sem depender do modelo:
1. frases inteiras primeiro, quando todas as palavras delas estão no vocabulário
   ("como você está" → "how are you", "onde você trabalha" → "where do you work");
2. depois cada palavra: cada tradução separada por "/" vale sozinha, verbos casam
   conjugados (trabalho, trabalha, trabalhando → work);
3. traduções ambíguas demais ("é", "a", "de") não trocam: quebrariam a frase;
4. duas palavras de conteúdo não ficam coladas ("um name work"); palavras de função
   juntas, sim ("to you", "how are you").
"""

import re

from .vocabulario import FUNCAO, Palavra

LETRA = r"A-Za-zÀ-ÿ"
# (regex em português, inglês, palavras do vocabulário que a frase exige)
FRASES = [
    (r"como (?:é que )?(?:voc[eê]|vc) (?:est[aá]|vai)", "how are you", {"how", "are", "you"}),
    (r"onde (?:é que )?(?:voc[eê]|vc) trabalha", "where do you work", {"where", "you", "work"}),
    (r"o que (?:é que )?(?:voc[eê]|vc) faz", "what do you do", {"what", "you"}),
    (r"prazer em (?:te )?conhecer(?: (?:voc[eê]|vc))?", "nice to meet you", {"nice", "meet"}),
    (r"qual (?:é )?o seu nome", "what is your name", {"what", "name"}),
    (r"(?:voc[eê]|vc)s est[aã]o", "you are", {"you", "are"}),
    (r"(?:voc[eê]|vc) est[aá]", "you are", {"you", "are"}),
    (r"o que", "what", {"what"}),
]
# traduções que aparecem em quase toda frase com outro sentido
AMBIGUAS = {"é", "e", "a", "o", "as", "os", "de", "da", "do", "em", "um", "uma", "são", "está", "estão", "eu", "ser", "estar"}
TERMINACOES = {
    "ar": ["o", "a", "as", "am", "amos", "ando", "ei", "ou", "ava", "ar"],
    "er": ["o", "e", "es", "em", "emos", "endo", "i", "eu", "ia", "er"],
    "ir": ["o", "e", "es", "em", "imos", "indo", "i", "iu", "ia", "ir"],
}


def _alternativas(pt: str) -> list[str]:
    """ "você / vocês" → ["você", "vocês"]; "trabalhar (verbo)" → ["trabalhar"]. """
    sem_parenteses = re.sub(r"\([^)]*\)", " ", pt)
    out = []
    for parte in re.split(r"[/,;]", sem_parenteses):
        p = " ".join(parte.split()).lower()
        if len(p) >= 2 and p not in AMBIGUAS and "auxiliar" not in p:
            out.append(p)
    return out


def _formas(alt: str) -> list[str]:
    """Verbo no infinitivo casa também conjugado (trabalhar → trabalho, trabalha, trabalhando)."""
    if " " in alt or len(alt) < 5 or alt[-2:] not in TERMINACOES:
        return [alt]
    raiz = alt[:-2]
    return list(dict.fromkeys([alt] + [raiz + t for t in TERMINACOES[alt[-2:]]]))


def _padrao(pt: str) -> re.Pattern:
    return re.compile(rf"(?<![{LETRA}]){pt}(?![{LETRA}])", re.IGNORECASE)


def _com_caixa(original: str, en: str) -> str:
    return en[:1].upper() + en[1:] if original[:1].isupper() else en


def usar_vocabulario(texto: str, vocabulario: list[Palavra], marcas: bool = False) -> tuple[str, list[str]]:
    """
    Troca no texto (português) todas as palavras do vocabulário que couberem. Devolve o texto
    e as palavras em inglês usadas. Com `marcas`, cada palavra do vocabulário trocada vem entre
    [[ ]] (as palavras vivas da tela), sem tocar no "do" ou "a" do português.
    """
    if not texto or not vocabulario:
        return texto, []
    tem = {p.en.lower() for p in vocabulario}
    trocas: list[tuple[int, int, str]] = []  # (início, fim, inglês)
    tomado = [False] * len(texto)

    def marcar(inicio: int, fim: int, en: str) -> None:
        trocas.append((inicio, fim, _com_caixa(texto[inicio:fim], en)))
        for i in range(inicio, fim):
            tomado[i] = True

    # 1. frases inteiras
    for pt, en, exige in FRASES:
        if not exige <= tem:
            continue
        for m in _padrao(pt).finditer(texto):
            if not any(tomado[m.start():m.end()]):
                marcar(m.start(), m.end(), en)

    # 2. palavras soltas, das traduções mais longas para as mais curtas ("fim de semana" antes de "fim")
    candidatas: list[tuple[str, str]] = []
    for p in vocabulario:
        for alt in _alternativas(p.pt):
            candidatas += [(forma, p.en) for forma in _formas(alt)]
    for pt, en in sorted(candidatas, key=lambda c: -len(c[0])):
        for m in _padrao(re.escape(pt)).finditer(texto):
            if not any(tomado[m.start():m.end()]):
                marcar(m.start(), m.end(), en)

    if not trocas:
        return texto, []
    trocas.sort()

    # 3. duas palavras de conteúdo coladas viram frase sem sentido: fica só a primeira
    conteudo = lambda en: en.lower() not in FUNCAO and " " not in en  # noqa: E731
    finais: list[tuple[int, int, str]] = []
    for t in trocas:
        if finais:
            ant = finais[-1]
            entre = texto[ant[1]:t[0]]
            if not entre.strip() and conteudo(ant[2]) and conteudo(t[2]):
                continue
        finais.append(t)

    saida, fim_anterior, usadas = [], 0, []
    for inicio, fim, en in finais:
        saida.append(texto[fim_anterior:inicio])
        saida.append(re.sub(r"[A-Za-z']+", lambda m: f"[[{m.group(0)}]]" if m.group(0).lower() in tem else m.group(0), en) if marcas else en)
        usadas.append(en)
        fim_anterior = fim
    saida.append(texto[fim_anterior:])
    return "".join(saida), usadas