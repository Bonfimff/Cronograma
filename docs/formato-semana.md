# Arquivos JSON do Inglês Híbrido

O app lê dois tipos de arquivo JSON:

| Arquivo | Onde importar | Para quê |
|---|---|---|
| **Pacote semanal** (`ingles-hibrido/semana@2`; o `@1` continua aceito) | Semana → Montar semana (JSON) | planejar uma semana, alguns dias ou uma aula: conteúdo novo, folhas da Biblioteca, plano dos dias e sessões, integrado ao vocabulário do aluno |
| **Backup** (`ingles-hibrido/backup@1`) | Ajustes → Outros → Backup dos dados | levar **todos** os dados para outro aparelho ou guardar uma cópia |

Os dois são validados antes de entrar. Erros bloqueiam a importação e dizem o que corrigir;
avisos só informam. Um arquivo trocado (pacote no lugar do backup) é reconhecido e o app diz onde importá-lo.

---

## Pacote semanal

Baixe um modelo comentado em **Montar semana → Baixar modelo**, ou exporte uma semana
existente em **Exportar semana**, edite e importe de volta.

```jsonc
{
  "format": "ingles-hibrido/semana@2",
  "aluno": { … },                // gerado pelo app: o vocabulário e o estado de cada palavra (só leitura)
  "week": "2026-09-21",          // opcional: qualquer data da semana (vira a segunda-feira)
  "goals": "…",                  // objetivos: saem nas anotações da folha semanal impressa
  "content": { … },              // conteúdo novo (opcional)
  "sheets": [ … ],               // folhas da Biblioteca (opcional)
  "days": [ … ]                  // obrigatório: só os dias que vão mudar
}
```

A estrutura formal (JSON Schema, para validar ou para a IA seguir) fica em
[`public/formatos/semana@2.schema.json`](../public/formatos/semana@2.schema.json), publicada em
`https://eita.exksvol.com/formatos/semana@2.schema.json`.

### O que mudou do `@1` para o `@2`

Todos os campos novos são opcionais: um arquivo `@1` continua sendo importado igual.

| Campo | Onde | Para quê |
|---|---|---|
| `aluno` | raiz | o que o aluno já sabe, gerado pelo app (Modelo e Exportar) |
| `palavras` | sessão | `novas` (o foco), `revisar` (quase esquecidas), `apoio` (firmes) |
| `aula` | sessão | cartões escritos à mão: aquecimento, escuta, fala, missão |
| `habilidade` | exercício | reconhecer, lembrar, ouvir, falar ou usar (vai para o relatório) |
| `chat.treino` | sessão | perguntas do treino de conversa ligadas à aula |
| `week` opcional | raiz | mandar só alguns dias ou uma aula |
| `refs` opcional | sessão | sem `refs`, a sessão estuda `palavras.novas` + `palavras.revisar` |

### `aluno`: o vocabulário que a aula deve usar

Sai preenchido em **Modelo** e **Exportar**. Cada palavra é uma linha curta, para caber num chat de IA:

```jsonc
"aluno": {
  "gerado_em": "2026-10-04",
  "vocabulario": [
    // [inglês, português, estado, chance de lembrar hoje, degrau]
    ["where", "onde", "quase_esquecida", 0.62, 1],
    ["schedule", "agenda", "estudando", 0.9, 1],
    ["work", "trabalho", "firme", 0.94, 4]
  ],
  "dificuldades": { "palavras": ["ship"], "pronuncia": ["Som de \"th\" (think, this)"] },
  "ja_estudado": ["word:work", "expression:how-are-you"]
}
```

| Estado | Regra (modelo de memória) | Como usar |
|---|---|---|
| `firme` | chance de lembrar ≥ 85% e degrau ≥ 2 | à vontade, em `palavras.apoio`, exemplos e exercícios |
| `estudando` | praticada, ainda sem firmar | repetir em contexto |
| `quase_esquecida` | chance de lembrar abaixo de 85% | em `palavras.revisar` de alguma sessão da semana |
| `nao_praticada` | na lista, nunca praticada | pode virar palavra nova |

Degrau: 0 vista, 1 reconhece, 2 lembra sozinho, 3 entende ouvindo, 4 pronuncia, 5 usa no chat.
Com mais de 600 palavras, vão as que não estão firmes e as firmes mais praticadas. O bloco é
ignorado na importação: não precisa voltar na resposta.

**Ritmo (`aluno.ritmo`)**: quantas palavras novas cabem na semana é decisão do app, não da IA.
Cada pessoa fixa num ritmo, e o que ainda está em treino precisa de espaço para firmar. A conta é
semanal: até 10 novas, uma a menos a cada 3 palavras em treino (estudando ou quase esquecida);
com 8 ou mais quase esquecidas, no máximo 2; com retenção média abaixo de 75%, metade. Com o treino
cheio, `novas_na_semana` é 0 e a semana é só de reforço. As novas não precisam vir todo dia; as
aulas sem novidade aprofundam o que está em treino. A prévia avisa quando o arquivo passa do teto.

```jsonc
"ritmo": { "novas_na_semana": 4, "em_treino": 18, "quase_esquecidas": 3, "retencao_media": 0.86,
           "motivo": "Até 4 palavras ou expressões novas na semana: 18 palavras ainda em treino." }
```

**Profundidade**: o modelo traz uma aula completa ("Where do you work?") como referência de tamanho:
palavras novas com pronúncia, uso e 3 exemplos; 8 a 12 exercícios de todos os tipos; escuta, fala e
missão com frases diferentes; dicas com os erros comuns de quem fala português. A prévia avisa sobre
aulas com poucos exercícios, frases repetidas entre os cartões, exercícios repetidos entre aulas e
palavras novas com menos de 3 exemplos. `build` sem `tokens` e `match` com pares em objeto são
corrigidos sozinhos na importação.

### `palavras`, `aula`, `habilidade` e `chat.treino` na sessão

```jsonc
{
  "kind": "new", "title": "Where do you work?",
  "refs": ["pattern:pergunta-com-do"],
  "palavras": { "novas": ["word:work"], "revisar": ["word:where"], "apoio": ["word:do"] },
  "aula": {
    "aquecimento": "word:where",                                  // abre a aula como lembrança
    "escuta": [{ "en": "I work at home.", "pt": "Eu trabalho em casa." }],
    "fala":   [{ "en": "Where do you work?", "pt": "Onde você trabalha?" }],
    "missao": { "situacao": "Um colega novo chegou…", "tarefas": [{ "en": "Where do you work?", "pt": "Onde você trabalha?" }] }
  },
  "exercises": [{ "type": "choice", "habilidade": "reconhecer", "prompt": "Where ___ you work?", "options": ["do", "are"], "answer": "do" }],
  "chat": { "treino": [{ "en": "Where do you work?", "pt": "Onde você trabalha?", "resposta": "I work at ____." }] }
}
```

- **`aula`**: o que vier substitui o cartão que o app montaria; o que faltar, o app monta. Sem
  `aula.aquecimento`, a primeira palavra de `palavras.revisar` abre a aula.
- **`habilidade`**: sem ela, o app deduz (escolha = reconhecer, digitar = lembrar).
- **`chat.treino`**: quando existe, o treino da Conversa ("vamos treinar") usa essas perguntas,
  da aula mais recente primeiro.

### Conferência com o vocabulário (na prévia)

A prévia mostra **"Conversa com o seu vocabulário"**. São alertas: nada aqui bloqueia a importação.

| Conferência | Regra | Por quê |
|---|---|---|
| Cobertura | ≥ 95% das palavras de cada aula (exemplos, exercícios, escuta, fala, missão, treino) são do vocabulário ou novas daquela aula | entender sem travar pede 95% a 98% de palavras conhecidas (Hu & Nation, 2000) |
| Repetição | cada palavra nova aparece em pelo menos 3 sessões da semana | prática espaçada fixa mais (Kim & Webb, 2022) |
| Revisão | toda palavra `quase_esquecida` volta em alguma sessão | revisar antes de esquecer (curva do esquecimento, FSRS) |
| Habilidades | cada aula treina pelo menos 3 das 5 habilidades | saber uma palavra tem níveis (Nation) |

Repetição e revisão só são conferidas quando o arquivo traz uma semana inteira (5 dias ou mais).

Campos que começam com `$` (como `$leia_me` e `$plataforma`) são ignorados na importação —
servem de instrução para quem (ou o que) escreve o arquivo.

### O que a plataforma faz com cada campo

O modelo baixado traz esta tabela em `$plataforma`, para quem monta a semana à mão ou pede a uma IA:

| Recurso | De onde vem |
|---|---|
| **Aula guiada** (Entender → Observar → Relacionar → Praticar → Avaliar) | `app.intro`, `app.context`, `app.tips`, o conteúdo de `refs`, `exercises`, `expected` |
| **Ler aula** (a mesma aula em texto corrido) | tudo acima; quanto mais campos preenchidos, mais completa |
| **Ouvir e traduzir ao toque** | `words[].word`, `words[].audio`, `expressions[].text`, `examples[].en` + as traduções |
| **Folha impressa e leitura do verso** | `sheet.copy`, `sheet.quiz`, `sheet.practice`, `whenToUse` |
| **Revisão espaçada** | `refs` (entram no histórico ao finalizar a sessão) |
| **Biblioteca** | `words`, `expressions`, `patterns`, `grammar`, `sheets` |
| **Jogos** (Tetris, Flashcards, Ligar palavras, Cruzadas) | `words` e suas `variations`, `expressions`, `sheets` — nas cruzadas, só palavras de 3 a 9 letras sem espaço ou hífen |
| **Exercícios** | `exercises` (ids existentes ou objetos completos); sem eles, a aula gera os seus |
| **Ler a folha em voz alta** (Biblioteca) | `words`, `expressions`, `patterns`, `grammar` e as traduções; o ritmo vem do painel de repetição e dos Ajustes |
| **Meu progresso** | histórico de `refs` e o resultado das sessões corrigidas, mais o placar dos jogos (nada disso vem no arquivo) |
| **Só no aparelho** (não entra nem sai do arquivo) | tema claro/escuro, estrela das folhas, nome dado a cada folha, vozes e velocidades dos Ajustes |

### `content` — conteúdo novo

Mesmo formato dos arquivos em `/content`. Pode citar o conteúdo que já existe. O mesmo `id` de um
item existente **substitui** esse item (com aviso quando é conteúdo da base).

| Tipo | Obrigatório | Opcional (se faltar, entra vazio) |
|---|---|---|
| `words` | `id`, `word`, `translations` (com `text`), `core_meaning` | `type`, `pronunciation.ipa`\*, `uses`, `variations`, `related_words`, `examples`, `copy` |
| `expressions` | `id`, `text`, `translation` | `words`, `context`, `meaning`, `pattern`, `examples`, `copy` |
| `patterns` | `id`, `formula` | `name`, `slots`, `explanation`, `examples`, `copy` |
| `grammar` | `id`, `title` | `explanation`, `points`, `examples`, `copy` |
| `examples` | `id`, `en`, `pt` | `context` |
| `topics` | `id`, `title` | `description`, `objective`, `refs` |
| `exercises` | `id`, `type`, `prompt` (+ `answer` / `options` / `pairs` conforme o tipo) | `refs` |

\* Sem `pronunciation.ipa` a importação avisa: o flashcard e o verbete ficam sem a linha de pronúncia.

Os campos opcionais que faltarem são **completados na importação** (listas vazias, textos vazios).
Assim, uma palavra só com o obrigatório já funciona na Biblioteca, nos Flashcards, no Tetris e no
jogo de ligar palavras. As palavras de `words` (e as `variations` delas) entram automaticamente nos jogos.

As referências entre itens são conferidas: `examples` precisa existir; `variations[].ref`,
`topics[].refs` e as `refs` das sessões também. Palavra ou padrão citados em uma expressão que não
existam geram aviso (o link fica sem destino).

### `sheets` — folhas da Biblioteca

```json
"sheets": [
  { "title": "Trabalho", "items": [{ "en": "office", "pt": "escritório" }] }
]
```

Uma folha com o **mesmo título** de uma que já existe (sem diferenciar maiúsculas) recebe só as
entradas novas; entradas repetidas (mesmo inglês e português) não entram de novo. As palavras das
folhas também aparecem no jogo de ligar palavras.

### `days` e sessões

```jsonc
{
  "date": "2026-09-21",         // data que existe, dentro da semana
  "theme": "…", "objective": "…", "minutes": 20,
  "sessions": [{
    "id": "ENG-2026-0001",      // opcional — ver abaixo
    "kind": "new",              // new, practice, review, reinforce, consolidate
    "title": "…",
    "refs": ["word:how", "expression:how-are-you"],   // pelo menos um
    "copyRefs": ["word:how"],
    "topic": "…",
    "whenToUse": "…",           // até ~116 caracteres na folha
    "sheet": { "copy": ["até 3 linhas de 68 caracteres"], "quiz": ["até 6 itens"], "practice": "…" },
    "app": { "intro": "…", "context": "…", "tips": ["…"] },
    "exercises": ["x-id-existente", { "type": "choice", "prompt": "…", "options": ["…"], "answer": "…" }],
    "expected": { "result": "…", "criteria": ["…"] }
  }]
}
```

### Mandar só alguns dias (ou uma aula só)

O arquivo não precisa trazer a semana inteira. **Só os dias que estão no arquivo mudam**; os outros
ficam exatamente como estão. `week` pode ficar de fora: a semana vem da data do primeiro dia.

```json
{
  "format": "ingles-hibrido/semana@1",
  "days": [
    { "date": "2026-10-08", "sessions": [
      { "kind": "practice", "title": "Where do you work?", "refs": ["word:work"] }
    ] }
  ]
}
```

A aula do arquivo atualiza a aula do aparelho com o **mesmo código** (`id`) ou, sem código, a do
**mesmo dia com o mesmo título**. Se nenhuma corresponder, a aula é criada. As outras aulas daquele
dia continuam lá, a menos que a opção "Nos dias do arquivo, tirar as aulas não iniciadas que não
estão nele" esteja marcada.

### Reimportar sem perder o que já foi feito

A semana exportada traz o **código** de cada sessão (`id`, o mesmo do QR da folha) e o `status`
(só informativo). Ao importar:

| A sessão do arquivo… | O que acontece |
|---|---|
| não tem `id` | atualiza a aula planejada do mesmo dia com o mesmo título; se não houver, é **criada** com código novo |
| tem `id` de uma sessão **planejada** | é **atualizada no lugar**, com o mesmo código — a folha impressa continua valendo |
| tem `id` de uma sessão **iniciada ou feita** | fica **como está** (nada é duplicado nem sobrescrito) |
| tem `id` que não existe neste aparelho | é criada com código novo (com aviso) |

**Palavras citadas pelo nome.** Uma referência como `"word:office"` vale mesmo que o id da palavra
seja outro: o app procura a palavra (ou expressão) pelo texto no vocabulário do aluno e no `content`
do arquivo. Se ela não existir em lugar nenhum, o arquivo é aceito do mesmo jeito: a prévia avisa e
essa palavra só fica de fora daquela aula. Para ensinar uma palavra nova, ela precisa estar em
`content.words`.

Com **"Nos dias do arquivo, tirar as aulas não iniciadas que não estão nele"** marcado, as aulas
planejadas desses dias que não vieram no arquivo são removidas. Dias fora do arquivo nunca são tocados. A prévia mostra exatamente quantas
sessões serão criadas, atualizadas, mantidas e removidas antes de importar.

---

## Pedir a semana a uma IA

O arquivo foi feito para isso: você baixa o modelo em **Semana → Montar semana (JSON) → Modelo**,
cola num chat de IA junto com o pedido abaixo e importa a resposta de volta.

O próprio modelo já traz tudo o que a IA precisa ler, em três blocos que o aplicativo ignora na
importação (campos que começam com `$`):

| Bloco | Para quê |
|---|---|
| `$como_pedir.pedido` | o texto do pedido, pronto para colar |
| `$como_pedir.preencha` | o que **você** responde antes: nível, tempo por dia, o que precisa nesta semana, o que já estudou, como gosta de estudar |
| `$como_pedir.regras` | as regras que o arquivo precisa respeitar para o aplicativo aceitar (ids, datas, limites da folha, tipos de exercício) |
| `$plataforma` | o que cada recurso do aplicativo faz com cada campo |
| `$leia_me` | o significado campo a campo |

Roteiro curto:

1. Baixe o modelo e abra o arquivo.
2. Preencha as respostas de `$como_pedir.preencha` (pode escrever direto no chat).
3. Cole o arquivo inteiro e o pedido na IA.
4. Traga o JSON da resposta para **Montar semana**, confira a prévia e importe.

A prévia mostra o que vai ser criado, atualizado ou mantido antes de qualquer coisa mudar, então dá
para importar sem medo e ajustar depois.

## Backup

É o `UserData` inteiro mais os dados dos jogos:

```jsonc
{
  "format": "ingles-hibrido/backup@1",
  "exportedAt": "2026-09-21T12:00:00.000Z",
  "version": 1,
  "counter": { "2026": 12 },    // sequência dos códigos ENG-AAAA-NNNN
  "weeks": [ … ],  "sessions": [ … ],  "worksheets": [ … ],  "history": [ … ],
  "content": { … },             // conteúdo criado ou importado pelo usuário
  "sheets": [ … ],              // folhas da Biblioteca
  "games": {                    // recordes e estatística por palavra (dificuldade do Tetris)
    "word-tetris-best": "1850",
    "word-tetris-word-stats": "{…}",
    "word-match-best-streak": "7"
  }
}
```

Importar um backup **substitui** os dados atuais (o app pede confirmação com um resumo). Backups
antigos, sem `format` nem `games`, continuam sendo aceitos: as listas que faltarem entram vazias,
sessões danificadas ficam de fora (e são contadas), e os recordes que já estão no aparelho não são
apagados por um backup que não os traz.
