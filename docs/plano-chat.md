# Plano do chat: um amigo de treino

Documento para revisão. Descreve o que o chat deve fazer, e onde cada parte
mora: no aplicativo, no servidor ou na máquina do modelo.

## 1. O que o chat é

Um amigo que puxa conversa em português e vai costurando, no meio da fala, as
palavras em inglês que você já estudou. Não é aula nem exercício: é conversa.
A palavra em inglês aparece sublinhada com pontinhos; ao tocar nela, você ouve
a pronúncia e vê a tradução.

A conversa é em português de propósito. Quem está aprendendo trava quando
precisa produzir frases inteiras em inglês; aqui a língua de conforto segura o
assunto e o inglês entra em doses, sempre no contexto de uma frase que você
entendeu.

Exemplo do que o modelo deve produzir:

> E aí, como foi o fim de semana? Você conseguiu **[[rest]]** um pouco ou
> passou o tempo todo correndo atrás das coisas? Eu ando precisando de um
> **[[break]]** também.

## 2. As três máquinas

```
Aplicativo (navegador)        Servidor Ubuntu              PC de casa
  desenha a conversa   ──►   decide as palavras    ──►   só gera texto
  toca a pronúncia           lê o vocabulário            (Ollama, qwen3b-opt)
  mostra a tradução          marca e confere
  guarda o histórico         guarda a conversa
```

### Aplicativo (este repositório, `src/`)

Responsável por tudo o que se vê e se ouve. Não sabe escolher palavras e não
fala com o modelo: fala só com o servidor.

- Desenhar as falas e o campo de escrever.
- Transformar as marcas `[[palavra]]` em palavra viva: sublinhado pontilhado,
  toque que reproduz a pronúncia (Web Speech API, voz já escolhida nos Ajustes)
  e mostra a tradução num balão.
- Guardar a conversa no aparelho para ela continuar depois de fechar.
- Avisar quando o modelo está fora do ar, sem travar a tela.

### Servidor (`server/`, Ubuntu)

É o cérebro da coisa. Tem o que o modelo não tem: a conta, o vocabulário e a
memória.

- **Escolher as palavras da vez.** Lê a tabela `records` do usuário
  (`kind='content'`, `id` começando em `words:`) e cruza com o histórico de
  acertos e erros para saber o que está vencido para revisão.
- **Montar a instrução** que vai ao modelo: a persona do amigo, o idioma da
  conversa e a lista curta de palavras a usar.
- **Conferir e marcar a resposta.** O modelo é pequeno e erra o formato; o
  servidor não confia nele (ver seção 4).
- **Anexar o glossário**: para cada palavra marcada, a tradução vem do banco, da
  própria ficha do usuário, não da invenção do modelo.
- **Guardar a conversa**, para ela acompanhar você entre o computador e o
  celular.

### PC de casa (Ollama)

Só gera texto. Não sabe quem é o usuário, não guarda conversa, não conhece o
vocabulário. Recebe uma lista de mensagens e devolve uma resposta. Trocar
`qwen3b-opt` por um modelo maior amanhã não muda nada nas outras duas máquinas.

## 3. Como o servidor pega a lista de vocabulário

Pergunta do item 2 da sua lista. A resposta curta: **o aplicativo não precisa
pedir nada**. O vocabulário já está no banco do servidor, porque a
sincronização o colocou lá. O servidor lê direto da tabela quando monta a
conversa.

Em SQL, é isto, dentro da própria rota do chat:

```sql
SELECT record_id, data
  FROM records
 WHERE user_id = :usuario
   AND kind = 'content'
   AND record_id LIKE 'words:%'
   AND deleted = 0;
```

Cada `data` é a ficha da palavra, com `en`, `pt` e os significados. O histórico
de estudo está na mesma tabela, com `kind='history'`, e é dele que sai quem
está vencido para revisão.

O critério de escolha, para a primeira versão:

1. Palavras com erro recente vêm primeiro.
2. Depois, as que não aparecem há mais tempo.
3. Sem número fixo por resposta. O limite é o encaixe: a palavra entra quando
   cabe naturalmente na frase, como em "Hi, bom dia!". Forçar palavra que não
   cabe estraga a conversa, e é melhor uma resposta sem nenhuma.
4. Nunca a mesma palavra duas respostas seguidas.

A rota `GET /vocabulario` existiria só para a tela de depuração, para você ver
o que o servidor está enxergando. O chat não depende dela.

## 4. O problema do modelo pequeno, e a saída

Um modelo de 3 bilhões de parâmetros não obedece formato com confiança. Vai
esquecer os colchetes, marcar palavra errada, às vezes responder em inglês
quando foi pedido português.

Por isso o servidor **não confia na marcação do modelo**. Ele faz assim:

1. Pede a resposta em português, com as palavras pedidas, marcando com `[[ ]]`.
2. Recebe o texto e joga fora as marcas que vieram.
3. Varre o texto procurando as palavras do vocabulário do usuário, por conta
   própria, e marca todas que encontrar.

Assim a marcação é sempre certa, mesmo quando o modelo falha: ela é feita por
comparação com o banco, não por obediência. O modelo só precisa acertar o
assunto e o idioma, que é o que ele faz bem.

Se mesmo assim a resposta vier sem nenhuma palavra em inglês, o servidor tenta
uma segunda vez. Falhando de novo, entrega a resposta como veio: conversa boa
sem palavra marcada ainda vale mais do que erro na tela.

## 5. O formato da resposta

O servidor devolve ao aplicativo:

```json
{
  "reply": "Você conseguiu [[rest]] um pouco no fim de semana?",
  "glossary": [
    { "en": "rest", "pt": "descansar", "id": "words:rest" }
  ]
}
```

O aplicativo recorta o texto nas marcas e troca cada uma por um botão. O
glossário diz o que mostrar no balão e qual ficha abrir se você quiser ver a
palavra inteira na Biblioteca.

## 6. O que fica para depois

Separado de propósito, para a primeira versão sair funcionando:

- **Contar o toque como estudo.** Tocar na palavra para ver a tradução é sinal
  de que ela não estava firme; isso deveria entrar no histórico e puxar a
  palavra para a revisão. Fica para a segunda rodada porque mexe no cálculo de
  progresso.
- **Falar por voz**, em vez de escrever.
- **Correção do que você escreve.** O amigo não corrige. A única exceção é
  quando ele não entender: aí pergunta o que você quis dizer, como faria
  qualquer pessoa numa conversa.
- **Adicionar palavra ao vocabulário pelo próprio chat**, sem sair da conversa.
- **Resumo da conversa longa**, para caber nos 4096 tokens de contexto.

## 7. Etapas

| Etapa | Onde | O que entrega |
| --- | --- | --- |
| 1 | servidor | escolha das palavras, instrução nova, marcação por comparação, glossário na resposta |
| 2 | aplicativo | palavra viva: sublinhado pontilhado, pronúncia ao toque, balão com a tradução |
| 3 | servidor + aplicativo | conversa guardada no banco, acompanhando os aparelhos, com apagar histórico |
| 4 | servidor | toque conta como estudo e alimenta a revisão |

A etapa 1 e a 2 juntas já entregam o que você descreveu. A 3 e a 4 são o que
transforma a conversa em parte do estudo, e não só um bate-papo.

## 8. Decidido

1. **Quantas palavras por resposta.** Sem número fixo: entram as que couberem
   com naturalidade no contexto. Nenhuma, se nenhuma couber.
2. **Vocabulário vazio, ou nada que encaixe.** O amigo conversa em português e
   pronto, sem forçar inglês. Mais adiante, poderá sugerir palavras novas e
   gravá-las no vocabulário ali mesmo, pela conversa.
3. **Correção.** Não corrige. Só pergunta quando não entender.
4. **A conversa vai para o banco**, na etapa 3, e você pode apagar o histórico:
   apagar some da conversa em todos os aparelhos, não só neste.
