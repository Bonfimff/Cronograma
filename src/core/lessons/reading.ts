import type { ContentRef, Example, Expression, Grammar, Pattern, Session, Word } from '../types';
import { examplesFor, getExamples, KIND_LABEL, parseRef, resolve } from '../content/repository';
import { explanationBlock, variationsBlock, type ExplanationItem, type VariationItem } from './lesson';

/**
 * Duas coisas moram aqui:
 *
 * 1. `refCard` — o cartão de um conteúdo: o que dizer em voz alta, a tradução, o
 *    significado e alguns exemplos. É o que aparece ao tocar num conteúdo, tanto
 *    na sessão quanto na leitura da aula.
 * 2. `readingLesson` — a aula inteira em forma de texto corrido, para ler do
 *    começo ao fim sem precisar avançar bloco a bloco.
 */

export interface RefCard {
  ref: ContentRef;
  /** "Palavra", "Expressão"… */
  kind: string;
  /** O texto em inglês (ou a fórmula do padrão / título da gramática). */
  label: string;
  /** O que a voz deve ler; ausente quando não há inglês para falar. */
  speak?: string;
  /** Tipo gramatical da palavra: "question word", "verb"… */
  role?: string;
  pronunciation?: string;
  /** Traduções em português, já com o contexto entre parênteses. */
  translations: string[];
  meaning?: string;
  points: string[];
  examples: Example[];
}

/** O cartão de um conteúdo: tudo o que dá para mostrar sem sair da página. */
export function refCard(ref: ContentRef): RefCard | null {
  const { kind } = parseRef(ref);
  const it = resolve(ref);
  if (!it) return null;
  const base = { ref, kind: KIND_LABEL[kind] ?? kind, points: [] as string[], translations: [] as string[], examples: examplesFor(ref).slice(0, 3) };

  if (kind === 'word') {
    const w = it as Word;
    return {
      ...base,
      label: w.word,
      speak: w.word,
      role: w.type,
      pronunciation: [w.pronunciation?.ipa, w.pronunciation?.respelling].filter(Boolean).join('  ·  ') || undefined,
      translations: w.translations.map((t) => (t.context ? `${t.text} (${t.context})` : t.text)),
      meaning: w.core_meaning,
      points: w.uses.map((u) => `${u.label}: ${u.meaning}`),
    };
  }
  if (kind === 'expression') {
    const e = it as Expression;
    return { ...base, label: e.text, speak: e.text, translations: [e.translation], meaning: [e.meaning, e.context].filter(Boolean).join(' ') };
  }
  if (kind === 'pattern') {
    const p = it as Pattern;
    return {
      ...base, label: p.formula, role: p.name, meaning: p.explanation,
      points: p.slots.map((s) => `${s.name}: ${s.options.join(' · ')}`),
    };
  }
  if (kind === 'grammar') {
    const g = it as Grammar;
    return { ...base, label: g.title, meaning: g.explanation, points: g.points };
  }
  return { ...base, label: ref, meaning: undefined };
}

/** Um trecho da aula para ler. */
export type ReadingPart =
  | { type: 'texto'; id: string; title: string; lead?: string; paragraphs: string[]; bullets: string[] }
  | { type: 'conceito'; id: string; item: ExplanationItem; examples: Example[]; card: RefCard | null }
  | { type: 'variações'; id: string; item: VariationItem }
  | { type: 'exemplos'; id: string; title: string; examples: Example[] }
  | { type: 'copiar'; id: string; title: string; lines: string[] }
  | { type: 'lista'; id: string; title: string; lead?: string; bullets: string[] };

export interface ReadingLesson {
  title: string;
  objective: string;
  /** Tempo de leitura estimado, em minutos (200 palavras por minuto, mínimo 1). */
  minutes: number;
  parts: ReadingPart[];
}

function countWords(parts: ReadingPart[]): number {
  const texts: string[] = [];
  parts.forEach((p) => {
    if (p.type === 'texto') texts.push(p.title, p.lead ?? '', ...p.paragraphs, ...p.bullets);
    if (p.type === 'lista') texts.push(p.title, p.lead ?? '', ...p.bullets);
    if (p.type === 'copiar') texts.push(...p.lines);
    if (p.type === 'conceito') texts.push(p.item.title, p.item.text, ...(p.item.points ?? []), ...p.examples.flatMap((e) => [e.en, e.pt]));
    if (p.type === 'exemplos') texts.push(...p.examples.flatMap((e) => [e.en, e.pt, e.context ?? '']));
    if (p.type === 'variações') texts.push(...p.item.rows.flatMap((r) => [r.head, r.body, r.note ?? '']));
  });
  return texts.join(' ').split(/\s+/).filter(Boolean).length;
}

/**
 * Monta a aula para leitura: abre com a situação e o que se espera, explica cada
 * conteúdo com seus exemplos, mostra as variações e fecha com o que treinar e
 * como se avaliar. Só entra o que a sessão realmente trouxe — nada de seção vazia.
 */
export function readingLesson(session: Session): ReadingLesson {
  const parts: ReadingPart[] = [];
  const push = (p: ReadingPart) => { parts.push(p); };

  const abertura: string[] = [];
  if (session.app?.context) abertura.push(session.app.context);
  if (session.app?.intro) abertura.push(session.app.intro);
  if (session.whenToUse) abertura.push(session.whenToUse);
  if (abertura.length || session.expected) {
    push({
      type: 'texto', id: 'abertura', title: 'Do que trata esta aula',
      lead: session.objective,
      paragraphs: abertura,
      bullets: session.expected ? [session.expected.result, ...(session.expected.criteria ?? [])] : [],
    });
  }

  if (session.app?.tips?.length) {
    push({ type: 'lista', id: 'dicas', title: 'Antes de começar', bullets: session.app.tips });
  }

  explanationBlock(session.refs).forEach((item, i) => {
    push({ type: 'conceito', id: `conceito-${i}`, item, examples: examplesFor(item.ref).slice(0, 4), card: refCard(item.ref) });
  });

  // exemplos que não apareceram em nenhum conceito
  const usados = new Set(parts.flatMap((p) => (p.type === 'conceito' ? p.examples.map((e) => e.id) : [])));
  const sobrando = session.refs.flatMap((r) => examplesFor(r)).filter((e) => !usados.has(e.id));
  const unicos = [...new Map(sobrando.map((e) => [e.id, e])).values()];
  if (unicos.length) push({ type: 'exemplos', id: 'exemplos', title: 'Mais exemplos', examples: unicos });

  variationsBlock(session.refs).forEach((item, i) => {
    if (item.rows.length) push({ type: 'variações', id: `variacoes-${i}`, item });
  });

  const copiar = session.sheet?.copy ?? [];
  if (copiar.length) push({ type: 'copiar', id: 'copiar', title: 'Conceito principal (vai para a folha)', lines: copiar });

  if (session.sheet?.quiz?.length) {
    push({ type: 'lista', id: 'quiz', title: 'Tente sem consultar', lead: 'Responda de cabeça antes de conferir na aula.', bullets: session.sheet.quiz });
  }
  if (session.sheet?.practice) {
    push({ type: 'texto', id: 'pratica', title: 'Sua prática', paragraphs: [session.sheet.practice], bullets: [] });
  }
  if (session.expected) {
    push({
      type: 'lista', id: 'avaliar', title: 'Como saber se aprendeu',
      lead: session.expected.result,
      bullets: session.expected.criteria ?? [],
    });
  }

  return {
    title: session.title,
    objective: session.objective,
    minutes: Math.max(1, Math.round(countWords(parts) / 200)),
    parts,
  };
}

/** Exemplos de um conteúdo, na ordem em que o JSON os declarou. */
export function examplesOf(ids: string[]): Example[] {
  return getExamples(ids);
}
