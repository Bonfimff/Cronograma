import type {
  ContentBundle, ContentKind, ContentRef, CopyBlock, Example, Exercise, Expression, Grammar, Pattern, Topic, Word,
} from '../types';
import words from '../../../content/words.json';
import expressions from '../../../content/expressions.json';
import patterns from '../../../content/patterns.json';
import grammar from '../../../content/grammar.json';
import examples from '../../../content/examples.json';
import topics from '../../../content/topics.json';
import exercises from '../../../content/exercises.json';

/** Conteúdo base: arquivos JSON em /content. */
export const baseContent: ContentBundle = {
  words: words as Word[],
  expressions: expressions as Expression[],
  patterns: patterns as Pattern[],
  grammar: grammar as Grammar[],
  examples: examples as Example[],
  topics: topics as Topic[],
  exercises: exercises as Exercise[],
};

/** Conteúdo efetivo = base + conteúdo do usuário (criado na plataforma ou importado). Mesmo id: o do usuário vale. */
export const content: ContentBundle = { ...baseContent };

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const idx = {
  word: new Map<string, Word>(),
  expression: new Map<string, Expression>(),
  pattern: new Map<string, Pattern>(),
  grammar: new Map<string, Grammar>(),
  topic: new Map<string, Topic>(),
  example: new Map<string, Example>(),
  exercise: new Map<string, Exercise>(),
};

function merge<T extends { id: string }>(base: T[], extra: T[] = []): T[] {
  const m = byId(base);
  extra.forEach((x) => m.set(x.id, x));
  return [...m.values()];
}

export function setUserContent(user: Partial<ContentBundle> = {}): void {
  (Object.keys(baseContent) as (keyof ContentBundle)[]).forEach((k) => {
    (content as unknown as Record<string, unknown[]>)[k] = merge(baseContent[k] as { id: string }[], user[k] as { id: string }[]);
  });
  idx.word = byId(content.words);
  idx.expression = byId(content.expressions);
  idx.pattern = byId(content.patterns);
  idx.grammar = byId(content.grammar);
  idx.topic = byId(content.topics);
  idx.example = byId(content.examples);
  idx.exercise = byId(content.exercises);
}
setUserContent();

export const getExercise = (id: string) => idx.exercise.get(id);

export type AnyItem = Word | Expression | Pattern | Grammar | Topic;

export function parseRef(ref: ContentRef): { kind: ContentKind; id: string } {
  const i = ref.indexOf(':');
  return { kind: ref.slice(0, i) as ContentKind, id: ref.slice(i + 1) };
}

export function resolve(ref: ContentRef): AnyItem | undefined {
  const { kind, id } = parseRef(ref);
  return (idx[kind] as Map<string, AnyItem>)?.get(id);
}

export const getWord = (id: string) => idx.word.get(id);
export const getExpression = (id: string) => idx.expression.get(id);
export const getPattern = (id: string) => idx.pattern.get(id);
export const getGrammar = (id: string) => idx.grammar.get(id);
export const getTopic = (id: string) => idx.topic.get(id);
export const getExample = (id: string) => idx.example.get(id);
export const getExamples = (ids: string[]) => ids.map(getExample).filter(Boolean) as Example[];

export function refLabel(ref: ContentRef): string {
  const { kind } = parseRef(ref);
  const it = resolve(ref);
  if (!it) return ref;
  switch (kind) {
    case 'word': return (it as Word).word;
    case 'expression': return (it as Expression).text;
    case 'pattern': return (it as Pattern).formula;
    case 'grammar': return (it as Grammar).title;
    case 'topic': return (it as Topic).title;
  }
}

export const KIND_LABEL: Record<ContentKind, string> = {
  word: 'Palavra', expression: 'Expressão', pattern: 'Padrão', grammar: 'Gramática', topic: 'Tema',
};

export function copyBlock(ref: ContentRef): CopyBlock | undefined {
  const it = resolve(ref) as { copy?: CopyBlock } | undefined;
  return it?.copy;
}

/** Todos os exemplos ligados a um conteúdo (incluindo usos de palavras). */
export function examplesFor(ref: ContentRef): Example[] {
  const { kind } = parseRef(ref);
  const it = resolve(ref);
  if (!it) return [];
  const ids = new Set<string>();
  if (kind === 'word') {
    const w = it as Word;
    w.examples.forEach((e) => ids.add(e));
    w.uses.forEach((u) => u.examples.forEach((e) => ids.add(e)));
  } else if (kind === 'topic') {
    (it as Topic).refs.forEach((r) => examplesFor(r).forEach((e) => ids.add(e.id)));
  } else {
    (it as Expression | Pattern | Grammar).examples.forEach((e) => ids.add(e));
  }
  return getExamples([...ids]);
}

export function allRefs(): ContentRef[] {
  return [
    ...content.words.map((w) => `word:${w.id}` as ContentRef),
    ...content.expressions.map((e) => `expression:${e.id}` as ContentRef),
    ...content.patterns.map((p) => `pattern:${p.id}` as ContentRef),
    ...content.grammar.map((g) => `grammar:${g.id}` as ContentRef),
  ];
}
