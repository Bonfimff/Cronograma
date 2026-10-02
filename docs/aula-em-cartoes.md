# Aula em cartões

Como a aula funciona e por quê. Código: `src/core/lessons/aula.ts` (montagem) e
`src/ui/pages/AulaPage.tsx` (tela). As rotas `#/aula/<id>` (estudo) e `#/leitura/<id>`
(só conteúdo) usam o mesmo player.

## Sequência

| # | Cartão | O que faz | Base |
|---|---|---|---|
| 1 | Abertura | título, situação, "ao final você vai conseguir", o que vem na aula, tempo | Gagné: atenção e objetivo |
| 2 | Aquecimento | lembrar uma palavra de aula anterior, ou arriscar a frase principal antes de aprender | prática de recuperação; efeito do pré-teste |
| 3 | Palavra-chave (até 4) | palavra, pronúncia, tradução, significado, exemplo, repetir no microfone | pré-treino (Mayer, efeito ≈ 0,75) |
| 4 | Conceito (até 4) | expressão, padrão (fórmula em blocos) ou gramática, com 2 exemplos | segmentação (Mayer, efeito ≈ 0,79) |
| 5 | Checagem rápida | 1 exercício logo após cada conceito (montar frase, completar, traduzir) | prática de recuperação; output (Swain) |
| 6 | Escuta | ouvir sem ler e escolher o significado | compreensão auditiva |
| 7 | Fala | ouvir e repetir a frase, com conferência palavra por palavra | shadowing / ouvir e repetir |
| 8 | Missão | dizer em inglês o que a situação pede (voz ou texto) | tarefa no fim (PPP com tarefa, TBLT) |
| 9 | Fechamento | frases-chave com áudio, copiar na folha, critérios, registro do resultado | Gagné: avaliação e transferência |

O que passa de 4 palavras ou 4 conceitos vai para "Saiba mais" no fechamento.

## Regras da tela

- Um cartão por vez; o resto some. Voltar e Próximo sempre à mão.
- Todo cartão tem "Ouvir este passo": lê português e inglês, cada um na sua voz, e
  destaca o trecho que está tocando. "Ler sozinho" (ligado por padrão) lê ao abrir o cartão.
- Todo inglês tem ouvir e ouvir devagar (0,7x).
- O passo em que a pessoa parou fica na sessão (`lessonStep`) e a aula retoma dali.
- Microfone: o reconhecedor do servidor (Whisper) mede se a frase foi entendida; aceita
  pronúncia aproximada (o mesmo critério do Fala-Rápida). Não é nota por fonema.
- Visual: papel rasgado (`.paper-card`), fita crepe, adesivo com o nome da etapa, marca-texto
  no inglês, fórmulas em blocos coloridos, ícones do kit doodle.

## Fontes

- Mayer, princípios de segmentação e pré-treino (Cambridge Handbook of Multimedia Learning).
- Revisão sistemática sobre shadowing (Oxford, 44 estudos).
- Meta-análise sobre reconhecimento de voz e pronúncia (ReCALL).
- Kim & Webb (2022), prática espaçada em L2; estudos de pré-teste em vocabulário L2.
- Swain, hipótese do output; Schmidt, noticing; Gagné, nove eventos de instrução.