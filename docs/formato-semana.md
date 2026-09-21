# Arquivos JSON do Inglês Híbrido

O app lê dois tipos de arquivo JSON:

| Arquivo | Onde importar | Para quê |
|---|---|---|
| **Pacote semanal** (`ingles-hibrido/semana@1`) | Semana → Montar semana (JSON) | planejar uma semana: conteúdo novo, folhas da Biblioteca, plano dos dias e sessões |
| **Backup** (`ingles-hibrido/backup@1`) | Hoje → Backup dos dados | levar **todos** os dados para outro aparelho ou guardar uma cópia |

Os dois são validados antes de entrar. Erros bloqueiam a importação e dizem o que corrigir;
avisos só informam. Um arquivo trocado (pacote no lugar do backup) é reconhecido e o app diz onde importá-lo.

---

## Pacote semanal

Baixe um modelo comentado em **Montar semana → Baixar modelo**, ou exporte uma semana
existente em **Exportar semana**, edite e importe de volta.

```jsonc
{
  "format": "ingles-hibrido/semana@1",
  "week": "2026-09-21",          // qualquer data da semana (vira a segunda-feira)
  "goals": "…",                  // objetivos: saem nas anotações da folha semanal impressa
  "content": { … },              // conteúdo novo (opcional)
  "sheets": [ … ],               // folhas da Biblioteca (opcional)
  "days": [ … ]                  // obrigatório
}
```

Campos que começam com `$` (como `$leia_me`) são ignorados.

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

### Reimportar sem perder o que já foi feito

A semana exportada traz o **código** de cada sessão (`id`, o mesmo do QR da folha) e o `status`
(só informativo). Ao importar:

| A sessão do arquivo… | O que acontece |
|---|---|
| não tem `id` | é **criada** com código novo |
| tem `id` de uma sessão **planejada** | é **atualizada no lugar**, com o mesmo código — a folha impressa continua valendo |
| tem `id` de uma sessão **iniciada ou feita** | fica **como está** (nada é duplicado nem sobrescrito) |
| tem `id` que não existe neste aparelho | é criada com código novo (com aviso) |

Com **"Tirar da semana as sessões não iniciadas que não estão no arquivo"** marcado, as sessões
planejadas da semana que você apagou do arquivo são removidas. A prévia mostra exatamente quantas
sessões serão criadas, atualizadas, mantidas e removidas antes de importar.

---

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
