"""
Induzir a escolha de palavras: quando o amigo escreve um sinônimo de uma palavra que a
pessoa já tem no vocabulário, a frase passa a usar a palavra dela.

Pedido de quem usa o app (04/10): "em vez de usar uma palavra que eu não tenha no meu
vocabulário, ele opte por montar uma frase com uma palavra que eu já tenho". O modelo
recebe o pedido na instrução (chat_slot.py), mas um modelo pequeno nem sempre obedece;
aqui a troca é por regras: "emprego" vira "trabalho" e, se a pessoa tem "work", a frase
mostra "work".

Cada grupo reúne palavras que podem trocar de lugar na mesma frase sem quebrar a
gramática (mesma classe, mesmo gênero e número quando importa). Grupos com sentidos
muito diferentes ficam de fora: melhor não trocar do que deformar a frase.
"""

GRUPOS: list[tuple[str, ...]] = [
    # substantivos
    ("trabalho", "emprego", "serviço", "ofício"),
    ("casa", "lar", "residência", "moradia"),
    ("carro", "automóvel", "veículo"),
    ("comida", "refeição", "alimento"),
    ("dinheiro", "grana", "verba"),
    ("amigo", "colega", "parceiro", "camarada"),
    ("amigos", "colegas", "parceiros"),
    ("criança", "garoto", "menino", "moleque"),
    ("crianças", "garotos", "meninos", "moleques"),
    ("mulher", "moça", "senhora"),
    ("homem", "rapaz", "sujeito"),
    ("cidade", "município"),
    ("rua", "avenida", "via"),
    ("loja", "comércio", "estabelecimento"),
    ("escola", "colégio"),
    ("médico", "doutor"),
    ("viagem", "passeio", "excursão"),
    ("problema", "dificuldade", "complicação"),
    ("ideia", "noção", "pensamento"),
    ("filme", "longa"),
    ("música", "canção"),
    ("livro", "obra"),
    ("tempo", "período"),
    ("dia", "jornada"),
    ("semana", "semaninha"),
    ("caminho", "trajeto", "percurso", "rota"),
    ("lugar", "local"),
    ("festa", "comemoração", "celebração"),
    ("jogo", "partida"),
    ("roupa", "vestimenta", "traje"),
    ("pergunta", "questão", "dúvida"),
    ("resposta", "retorno"),
    ("ajuda", "auxílio", "apoio"),
    ("chefe", "patrão", "gerente"),
    ("família", "parentes"),
    ("cachorro", "cão", "cachorrinho"),
    ("descanso", "folga", "pausa", "intervalo"),
    ("café", "cafezinho"),
    ("telefone", "celular", "fone"),
    ("computador", "notebook", "pc"),
    # verbos (infinitivo; usar_vocabulario conjuga)
    ("trabalhar", "labutar", "batalhar"),
    ("falar", "conversar", "papear"),
    ("andar", "caminhar", "passear"),
    ("comer", "almoçar", "jantar", "lanchar"),
    ("beber", "ingerir"),
    ("gostar", "curtir", "adorar"),
    ("querer", "desejar"),
    ("precisar", "necessitar"),
    ("começar", "iniciar"),
    ("terminar", "acabar", "finalizar", "concluir"),
    ("ajudar", "auxiliar", "apoiar"),
    ("comprar", "adquirir"),
    ("olhar", "observar", "espiar"),
    ("ver", "enxergar", "assistir"),
    ("ouvir", "escutar"),
    ("pensar", "imaginar"),
    ("saber", "conhecer"),
    ("entender", "compreender", "sacar"),
    ("lembrar", "recordar"),
    ("esquecer", "olvidar"),
    ("descansar", "relaxar", "repousar"),
    ("dormir", "cochilar"),
    ("estudar", "revisar"),
    ("morar", "viver", "residir"),
    ("voltar", "retornar", "regressar"),
    ("chegar", "aparecer"),
    ("sair", "ir embora"),
    ("tentar", "experimentar"),
    ("usar", "utilizar"),
    ("mostrar", "exibir"),
    ("encontrar", "descobrir"),
    ("perguntar", "indagar"),
    ("responder", "retrucar"),
    ("cozinhar", "preparar"),
    ("correr", "disparar"),
    ("jogar", "brincar"),
    ("ganhar", "vencer"),
    ("perder", "extraviar"),
    ("abrir", "destrancar"),
    ("fechar", "trancar"),
    # adjetivos
    ("bom", "legal", "bacana", "ótimo", "massa"),
    ("boa", "legal", "bacana", "ótima"),
    ("ruim", "chato", "péssimo"),
    ("grande", "enorme", "imenso"),
    ("pequeno", "miúdo", "minúsculo"),
    ("pequena", "miúda", "minúscula"),
    ("bonito", "lindo", "belo"),
    ("bonita", "linda", "bela"),
    ("feliz", "contente", "alegre"),
    ("triste", "chateado", "abatido"),
    ("cansado", "exausto", "esgotado"),
    ("cansada", "exausta", "esgotada"),
    ("rápido", "veloz", "ligeiro"),
    ("devagar", "lento", "vagaroso"),
    ("fácil", "simples", "tranquilo"),
    ("difícil", "complicado", "puxado"),
    ("novo", "recente"),
    ("velho", "antigo", "idoso"),
    ("rico", "endinheirado"),
    ("pobre", "humilde"),
    ("quente", "calorento"),
    ("frio", "gelado", "gélido"),
    ("ocupado", "atarefado", "corrido"),
    ("ocupada", "atarefada", "corrida"),
    ("importante", "relevante", "essencial"),
    ("engraçado", "divertido", "cômico"),
    ("delicioso", "gostoso", "saboroso"),
    ("caro", "custoso"),
    ("barato", "em conta"),
    ("certo", "correto", "exato"),
    ("errado", "incorreto", "equivocado"),
    # advérbios e expressões
    ("muito", "bastante", "demais"),
    ("agora", "neste momento"),
    ("hoje", "neste dia"),
    ("sempre", "constantemente"),
    ("nunca", "jamais"),
    ("talvez", "quem sabe", "possivelmente"),
    ("depois", "mais tarde", "em seguida"),
    ("também", "igualmente"),
    ("realmente", "de verdade"),
]


def sinonimos_de(palavra: str) -> list[str]:
    """Os outros membros dos grupos em que a palavra aparece (sem ela mesma)."""
    p = palavra.strip().lower()
    saida: list[str] = []
    for grupo in GRUPOS:
        if p in grupo:
            saida += [s for s in grupo if s != p and s not in saida]
    return saida
