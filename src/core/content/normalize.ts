import type {
  ContentBundle, Example, Exercise, Expression, Grammar, Pattern, Topic, Translation, Variation, Word, WordUse,
} from '../types';

/**
 * Completa o conteúdo com os campos opcionais que faltarem (listas vazias,
 * textos vazios, pronúncia vazia). As telas e os jogos leem esses campos sem
 * checar — Flashcards usa pronunciation.ipa, o Tetris percorre variations, a
 * Biblioteca percorre uses/slots/points —, então conteúdo importado sem eles
 * derrubava a tela. Não inventa nada: só garante o formato.
 */

/** Embaralha sempre do mesmo jeito para a mesma semente (aqui, sem importar exercises.ts: seria circular). */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const list = <T>(v: unknown, fix: (x: Record<string, unknown>) => T): T[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => fix(x as Record<string, unknown>)) : [];

export function normalizeWord(w: Record<string, unknown>): Word {
  const pron = (w.pronunciation && typeof w.pronunciation === 'object' ? w.pronunciation : {}) as Record<string, unknown>;
  return {
    ...(w as unknown as Word),
    id: str(w.id),
    word: str(w.word),
    type: str(w.type),
    translations: list<Translation>(w.translations, (t) => ({ ...t, text: str(t.text) })),
    core_meaning: str(w.core_meaning),
    uses: list<WordUse>(w.uses, (u) => ({
      ...(u as unknown as WordUse), id: str(u.id), label: str(u.label), meaning: str(u.meaning),
      explanation: str(u.explanation), examples: strs(u.examples),
    })),
    variations: list<Variation>(w.variations, (v) => ({ ...(v as unknown as Variation), form: str(v.form), meaning: str(v.meaning) })),
    related_words: strs(w.related_words),
    examples: strs(w.examples),
    pronunciation: { ...pron, ipa: str(pron.ipa) } as Word['pronunciation'],
  };
}

export function normalizeExpression(e: Record<string, unknown>): Expression {
  return {
    ...(e as unknown as Expression),
    id: str(e.id), text: str(e.text), words: strs(e.words), translation: str(e.translation),
    context: str(e.context), meaning: str(e.meaning), examples: strs(e.examples),
  };
}

export function normalizePattern(p: Record<string, unknown>): Pattern {
  return {
    ...(p as unknown as Pattern),
    id: str(p.id), name: str(p.name), formula: str(p.formula), explanation: str(p.explanation),
    slots: list(p.slots, (s) => ({ name: str(s.name), options: strs(s.options) })),
    examples: strs(p.examples),
  };
}

export function normalizeGrammar(g: Record<string, unknown>): Grammar {
  return { ...(g as unknown as Grammar), id: str(g.id), title: str(g.title), explanation: str(g.explanation), points: strs(g.points), examples: strs(g.examples) };
}

export function normalizeExample(x: Record<string, unknown>): Example {
  return { ...(x as unknown as Example), id: str(x.id), en: str(x.en), pt: str(x.pt) };
}

export function normalizeTopic(t: Record<string, unknown>): Topic {
  return { ...(t as unknown as Topic), id: str(t.id), title: str(t.title), description: str(t.description), objective: str(t.objective), refs: strs(t.refs) as Topic['refs'] };
}

/**
 * Pares de associação no formato do app, ["en", "pt"]. Uma IA às vezes manda objetos
 * ({left, right}, {en, pt}): sem isso o card de associação aparecia em branco.
 */
function pares(v: unknown): [string, string][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((p): [string, string] | null => {
    if (Array.isArray(p) && p.length >= 2) return [str(p[0]), str(p[1])];
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      const a = o.left ?? o.en ?? o.a ?? Object.values(o)[0];
      const b = o.right ?? o.pt ?? o.b ?? Object.values(o)[1];
      return [str(a), str(b)];
    }
    return null;
  }).filter((p): p is [string, string] => !!p && !!p[0] && !!p[1]);
  return out.length ? out : undefined;
}

/**
 * As peças do "monte a frase". Sem `tokens`, o card aparecia em branco: as peças saem das
 * palavras da resposta, embaralhadas sempre do mesmo jeito (o mesmo exercício, a mesma ordem).
 */
function pecas(id: string, answer: unknown, tokens: unknown): string[] | undefined {
  const dadas = strs(tokens).filter(Boolean);
  if (dadas.length) return dadas;
  const resposta = Array.isArray(answer) ? str(answer[0]) : str(answer);
  const palavras = resposta.replace(/[?.!,;:]/g, '').split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return undefined;
  const mist = shuffle(palavras, seeded(`pecas:${id}`));
  // embaralhou e ficou igual à resposta: gira uma casa para não entregar pronta
  return mist.join(' ') === palavras.join(' ') ? [...mist.slice(1), mist[0]] : mist;
}

export function normalizeExercise(x: Record<string, unknown>): Exercise {
  const id = str(x.id);
  const ex = { ...(x as unknown as Exercise), id, prompt: str(x.prompt), refs: strs(x.refs) as Exercise['refs'] };
  if (x.pairs !== undefined) ex.pairs = pares(x.pairs);
  if (ex.type === 'build') ex.tokens = pecas(id, x.answer, x.tokens);
  return ex;
}

const FIX: { [K in keyof ContentBundle]: (x: Record<string, unknown>) => ContentBundle[K][number] } = {
  words: normalizeWord,
  expressions: normalizeExpression,
  patterns: normalizePattern,
  grammar: normalizeGrammar,
  examples: normalizeExample,
  topics: normalizeTopic,
  exercises: normalizeExercise,
};

/** Normaliza um pacote de conteúdo inteiro; listas que não forem listas viram vazias. */
export function normalizeContent(c: Partial<ContentBundle> | undefined): Partial<ContentBundle> {
  const out: Partial<ContentBundle> = {};
  if (!c || typeof c !== 'object') return out;
  (Object.keys(FIX) as (keyof ContentBundle)[]).forEach((k) => {
    const v = (c as Record<string, unknown>)[k];
    if (v === undefined) return;
    (out as Record<string, unknown>)[k] = list(v, FIX[k] as (x: Record<string, unknown>) => unknown);
  });
  return out;
}
