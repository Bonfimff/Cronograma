# Plano de fluidez e integração

O app foi crescendo pedido a pedido: aula em cartões, folhas, jogos, Fala-Rápida, chat com
vocabulário, relatório com memória por palavra, professor, pacote semana@2. Cada parte funciona,
mas elas ainda conversam pouco entre si. Este plano junta tudo num fluxo só: **o app sabe o que
você está estudando e o que está escapando, e todas as telas usam essa mesma informação**, com o
próximo passo sempre à mão, sem precisar de comando.

## Diagnóstico (outubro de 2026)

| Onde | Como está | O problema |
|---|---|---|
| Memória | O modelo FSRS (`core/progress/memoria.ts`) só alimenta o relatório | Revisão, Hoje, jogos e chat ignoram o que ele sabe |
| Revisão | Intervalos fixos (1, 3, 7, 14, 30 dias) só do histórico das folhas | Palavra praticada em jogo ou aula nunca aparece; quase esquecida não é avisada |
| Hoje | Sessões do dia, revisão por histórico, próximos dias | Não diz "o que fazer agora", nem retoma a aula parada |
| Jogos | Sorteiam do vocabulário inteiro | Não treinam o que a aula ensinou nem o que está escapando |
| Fim da aula | Vai para a página da sessão | Sem próximo passo: treinar fala, conversar, revisar |
| Chat | Prioriza palavras pelo servidor; regras feitas para o modelo de 3B | Não sabe da aula de hoje nem da memória; o 7B fica preso a 2 frases |
| Chat ↔ app | Palavra no balão leva à ficha | Expressão leva a endereço errado; nenhuma tela abre o chat com contexto |
| Guia do chat | Descreve 5 telas, 4 jogos, conta opcional | Desatualizado: 6 telas, 5 jogos, conta obrigatória, relatório, professor, expressões |

## O fluxo que queremos

```
           ┌──────────── memória única (FSRS + escada + aula de hoje) ────────────┐
           │                                                                      │
   Hoje ── "Agora": continuar aula · revisar quase esquecidas · treinar conversa  │
     │                                                                            │
   Aula ── fim: próximos passos ─▶ Fala-Rápida / Flashcards com as palavras da aula
     │                              └─▶ Conversa com as palavras da aula (treino)  │
   Revisão ── quase esquecidas primeiro ─▶ jogar / conversar com elas             │
   Jogos ── foco: aula de hoje ou o que está escapando                            │
   Conversa ── usa as palavras em foco sem pedir; expressões inteiras; ao vivo    │
   Progresso ── plano da semana com botões que levam à ação                       │
           └──────────────────────────────────────────────────────────────────────┘
```

## Etapas (aplicadas nesta rodada)

### 1. Chat com profundidade (o Qwen 7B mostra o que sabe)
- Regras novas: 2 a 4 frases, comentar de verdade (opinião, detalhe, curiosidade), uma pergunta
  que puxa assunto; continua sem corrigir nem dar aula, a não ser que a pessoa peça.
- Saída em texto livre (sem JSON) quando o servidor faz a troca de palavras: o modelo escreve
  mais natural, o texto ao vivo sai limpo e a versão final chega logo depois da última palavra.
- Temperatura 0,6 (antes 0,3): menos respostas repetidas.

### 2. Memória única: "o que estudar agora"
- `core/estudo/foco.ts`: junta, de um jeito só, as palavras da aula de hoje (ou da última
  aula), as quase esquecidas (memória FSRS) e as que mais erram.
- Revisão: grupo **Quase esquecidas** no topo, vindo da memória (inclui palavras praticadas só
  em jogos e aulas), com botões de ação.
- Hoje e Revisão passam a usar a mesma lista.

### 3. Foco nos jogos
- Todo jogo aceita `?foco=revisar`, `?foco=aula:<código>` ou `?foco=palavras:a,b`: as palavras em
  foco vêm primeiro e completam com o resto do vocabulário.
- A tela de Jogos mostra o foco atual ("Jogar com as 8 palavras que estão escapando").

### 4. Próximo passo em todo fim de atividade
- Componente único `ProximosPassos`, com as ações que fazem sentido naquele momento.
- Fim da aula: falar as palavras (Fala-Rápida), fixar (Flashcards), conversar (treino da aula,
  quando existe), voltar para o Hoje.
- Hoje ganha o cartão **Agora**: continuar a aula parada, revisar as quase esquecidas, treinar a
  conversa da aula, e o resumo da memória (quantas palavras você lembra hoje).

### 5. Chat ligado ao app
- O app manda ao chat as palavras em foco a cada mensagem; o servidor coloca essas primeiro
  entre as palavras do dia. A conversa usa a aula de hoje e o que está escapando sem comando.
- `#/conversa?enviar=…` envia uma mensagem ao abrir (ex.: "Vamos treinar uma conversa").
- Balão de expressão leva à ficha certa (`expression:`).
- Guia do chat atualizado com as telas e recursos de hoje.

### 6. Progresso que leva à ação
- "Revise esta semana" e "Suba um degrau" com botões: jogar com essas palavras, conversar.

## Próximas rodadas (fora desta)
- Ritmo de revisão sugerido pela memória direto na Semana (montar sessões automáticas).
- Treino de pronúncia guiado pelos padrões de erro (th, vogal extra…).
- Correção opcional no chat ("modo professor"), com registro de erros por tipo no relatório.
