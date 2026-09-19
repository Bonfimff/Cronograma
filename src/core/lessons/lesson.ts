import type { ContentRef, Example, Expression, Grammar, Pattern, Word } from '../types';
import { examplesFor, getExamples, parseRef, resolve } from '../content/repository';

/**
 * A aula é montada em quatro blocos a partir dos conteúdos da sessão:
 * Entender (explicação) → Observar (exemplos) → Relacionar (variações) → Praticar (exercícios).
 */

export interface ExplanationItem {
  ref: ContentRef;
  kind: string;
  title: string;
  subtitle?: string;
  pronunciation?: string;
  translations?: string[];
  text: string;
  points?: string[];
  speak?: string;
}

export interface VariationItem {
  ref: ContentRef;
  title: string;
  rows: { head: string; body: string; note?: string; examples: Example[] }[];
}

export function explanationBlock(refs: ContentRef[]): ExplanationItem[] {
  return refs.flatMap((ref): ExplanationItem[] => {
    const { kind } = parseRef(ref);
    const it = resolve(ref);
    if (!it) return [];
    if (kind === 'word') {
      const w = it as Word;
      return [{
        ref, kind: w.type, title: w.word, speak: w.word,
        pronunciation: [w.pronunciation.ipa, w.pronunciation.respelling].filter(Boolean).join('  ·  '),
        translations: w.translations.map((t) => (t.context ? `${t.text} (${t.context})` : t.text)),
        text: w.core_meaning,
      }];
    }
    if (kind === 'expression') {
      const e = it as Expression;
      return [{ ref, kind: 'expressão', title: e.text, speak: e.text, translations: [e.translation], text: `${e.meaning} ${e.context}` }];
    }
    if (kind === 'pattern') {
      const p = it as Pattern;
      return [{ ref, kind: 'padrão', title: p.formula, subtitle: p.name, text: p.explanation }];
    }
    if (kind === 'grammar') {
      const g = it as Grammar;
      return [{ ref, kind: 'gramática', title: g.title, text: g.explanation, points: g.points }];
    }
    return [];
  });
}

export function examplesBlock(refs: ContentRef[]): Example[] {
  const map = new Map<string, Example>();
  refs.forEach((r) => examplesFor(r).forEach((e) => map.set(e.id, e)));
  return [...map.values()];
}

export function variationsBlock(refs: ContentRef[]): VariationItem[] {
  return refs.flatMap((ref): VariationItem[] => {
    const { kind } = parseRef(ref);
    const it = resolve(ref);
    if (kind === 'word') {
      const w = it as Word;
      const rows = [
        ...w.uses.map((u) => ({ head: u.label, body: u.meaning, note: u.explanation, examples: getExamples(u.examples) })),
        ...w.variations.map((v) => ({ head: v.form, body: v.meaning, note: v.note, examples: [] as Example[] })),
      ];
      return rows.length > 1 ? [{ ref, title: w.word, rows }] : [];
    }
    if (kind === 'pattern') {
      const p = it as Pattern;
      return [{
        ref, title: p.formula,
        rows: p.slots.map((s) => ({ head: s.name, body: s.options.join(' · '), examples: [] })),
      }];
    }
    return [];
  });
}

/** Pronúncia: usa o arquivo de áudio do conteúdo, se houver; senão, síntese de voz do sistema. */
export function speak(text: string, audioUrl?: string): void {
  if (audioUrl) {
    new Audio(audioUrl).play().catch(() => speak(text));
    return;
  }
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
