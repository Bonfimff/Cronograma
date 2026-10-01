"""
Em que língua a resposta veio.

O modelo foi instruído a falar português e escapa para o inglês com facilidade,
principalmente depois que a pessoa escreve uma frase em inglês. Não dá para
confiar na instrução: é preciso olhar o texto que voltou.

A conta é grosseira de propósito. Palavrinhas de função não se traduzem e
aparecem em quase toda frase, então basta contá-las dos dois lados: ganha quem
tiver mais. Serve para o que precisamos, que é decidir se vale pedir de novo.
"""

import re

PORTUGUES = {
    "que", "não", "nao", "você", "voce", "como", "está", "esta", "muito", "bem",
    "com", "para", "uma", "um", "dos", "das", "ele", "ela", "isso", "aqui",
    "também", "tambem", "mais", "meu", "minha", "seu", "sua", "foi", "tem",
    "sim", "então", "entao", "mas", "porque", "quando", "hoje", "ontem", "agora",
}
INGLES = {
    "the", "you", "your", "are", "that", "this", "with", "have", "what", "how",
    "about", "there", "would", "could", "doing", "going", "really", "sorry",
    "thanks", "great", "good", "well", "from", "they", "been", "just", "like",
}

PALAVRA = re.compile(r"[a-zá-úâ-ûã-õç]+", re.IGNORECASE)


def parece_portugues(texto: str) -> bool:
    """Verdadeiro quando o texto parece português (empate conta como sim)."""
    palavras = [p.lower() for p in PALAVRA.findall(texto)]
    if not palavras:
        return True
    pt = sum(1 for p in palavras if p in PORTUGUES)
    en = sum(1 for p in palavras if p in INGLES)
    return pt >= en
