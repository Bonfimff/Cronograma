"""
Expressões comuns: mais de uma palavra em inglês para uma ideia em português.

Servem a dois lugares:
- vocab_chat.py: tradução pronta quando a pessoa pede para adicionar ("adicione good morning");
- usar_vocabulario.py: no chat, "bom dia" vira "good morning" inteiro, e nunca "good dia".

Histórico de 05/10: com "good" (bom) no vocabulário, a resposta "Bom dia!" saía "Good dia!".
Uma expressão não é a soma das palavras; ela precisa ser reconhecida antes delas.
"""

EXPRESSOES = {
    "thank you": "obrigado", "thank you very much": "muito obrigado", "thanks a lot": "muito obrigado",
    "you're welcome": "de nada", "good morning": "bom dia", "good afternoon": "boa tarde",
    "good evening": "boa noite", "good night": "boa noite (despedida)", "excuse me": "com licença",
    "see you": "até mais", "see you later": "até mais tarde", "see you tomorrow": "até amanhã",
    "how are you": "como você está", "i'm fine": "estou bem", "nice to meet you": "prazer em conhecer",
    "of course": "claro", "no problem": "sem problema", "let's go": "vamos", "take care": "se cuida",
    "what's up": "e aí", "i don't know": "eu não sei", "me too": "eu também", "good luck": "boa sorte",
    "happy birthday": "feliz aniversário", "how much": "quanto", "what time": "que horas",
    "right now": "agora mesmo", "a lot": "muito", "i'm sorry": "sinto muito", "never mind": "deixa pra lá",
    "how old are you": "quantos anos você tem", "what's your name": "qual é o seu nome",
    "where are you from": "de onde você é", "i love you": "eu te amo", "have a nice day": "tenha um bom dia",
    "good job": "bom trabalho", "well done": "muito bem", "all right": "tudo bem", "i agree": "eu concordo",
    "at home": "em casa", "at work": "no trabalho", "day off": "dia de folga",
}

# Expressões que podem trocar sozinhas no meio de qualquer frase do chat, sem mudar o sentido.
# Ficam de fora as que dependem do contexto: "estou bem cansado" não é "I'm fine cansado", e
# "você está muito bem" não é "well done".
SEGURAS = {
    "thank you", "thank you very much", "you're welcome", "good morning", "good afternoon", "good evening",
    "excuse me", "see you later", "see you tomorrow", "good luck", "happy birthday", "nice to meet you",
    "never mind", "take care", "i love you", "have a nice day", "day off", "how are you", "what's your name",
    "where are you from", "how old are you", "i don't know", "me too", "no problem", "right now", "good job",
}


# Uma palavra só em português, mas sem outro sentido possível: pode virar a expressão inteira.
UMA_PALAVRA = {"thank you"}


def portugues_de(en: str) -> str:
    """ "boa noite (despedida)" → "boa noite": o português que aparece na frase."""
    pt = EXPRESSOES.get(en, "")
    return pt.split("(")[0].strip()
