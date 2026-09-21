import type { ContentRef, Example, Exercise, Session, UserData } from '../types';
import { content, examplesFor, getExercise, getWord, parseRef } from '../content/repository';

// ---------- aleatoriedade estável (mesma sessão → mesmos exercícios) ----------
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- correção ----------
const CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, 'i am'], [/\byou're\b/g, 'you are'], [/\bthey're\b/g, 'they are'], [/\bwe're\b/g, 'we are'],
  [/\bwhat's\b/g, 'what is'], [/\bwhere's\b/g, 'where is'], [/\bhow's\b/g, 'how is'], [/\bit's\b/g, 'it is'],
  [/\bshe's\b/g, 'she is'], [/\bhe's\b/g, 'he is'], [/\bdon't\b/g, 'do not'],
];
export function normalize(s: string): string {
  let t = s.toLowerCase().replace(/[’`]/g, "'");
  CONTRACTIONS.forEach(([re, v]) => (t = t.replace(re, v)));
  return t.replace(/[^a-z0-9à-ú' ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function checkAnswer(ex: Exercise, given: string): boolean {
  if (ex.answer === undefined) return true; // produção própria: sem gabarito
  const answers = Array.isArray(ex.answer) ? ex.answer : [ex.answer];
  const g = normalize(given);
  return answers.some((a) => {
    const n = normalize(a);
    return g === n || (ex.type === 'qa' && g.startsWith(n));
  });
}

// ---------- geração ----------
function wordsInSession(refs: ContentRef[]): string[] {
  const ids = new Set<string>();
  refs.forEach((r) => {
    const { kind, id } = parseRef(r);
    if (kind === 'word') ids.add(id);
  });
  return [...ids].map((id) => getWord(id)!.word).filter(Boolean);
}

function fromExample(ex: Example, i: number, sessionWords: string[], rnd: () => number, refs: ContentRef[]): Exercise | null {
  const base = { id: `g-${ex.id}-${i % 3}`, refs, generated: true };
  const tokens = ex.en.replace(/[?.!,]/g, '').split(' ');
  switch (i % 3) {
    case 0:
      return { ...base, type: 'translate', prompt: `Traduza para o inglês: “${ex.pt}”`, answer: ex.en };
    case 1:
      return { ...base, type: 'build', prompt: `Monte a frase: “${ex.pt}”`, tokens: shuffle(tokens, rnd), answer: ex.en };
    default: {
      const target = tokens.find((t) => sessionWords.includes(t.toLowerCase()));
      if (!target) return { ...base, type: 'translate', prompt: `Traduza para o português: “${ex.en}”`, answer: ex.pt };
      const distract = shuffle(sessionWords.filter((w) => w !== target.toLowerCase()), rnd).slice(0, 2);
      return {
        ...base,
        type: 'fill',
        prompt: ex.en.replace(new RegExp(`\\b${target}\\b`), '___') + `  (${ex.pt})`,
        options: shuffle([target.toLowerCase(), ...distract], rnd),
        answer: target.toLowerCase(),
      };
    }
  }
}

/** Palavras já estudadas em sessões anteriores (para reciclagem). */
function recycledRefs(data: UserData, session: Session): ContentRef[] {
  const seen = new Set(data.history.filter((h) => h.sessionId !== session.id).map((h) => h.ref));
  return [...seen].filter((r) => !session.refs.includes(r));
}

export function buildExercises(data: UserData, session: Session, max = 10): Exercise[] {
  const rnd = seeded(session.id);
  const refs = session.refs;
  const sessionWords = wordsInSession(refs);

  // escolhidos para a sessão primeiro; depois os do banco ligados aos mesmos conteúdos
  const chosen = (session.exerciseIds ?? []).map(getExercise).filter(Boolean) as Exercise[];
  const authored = [
    ...chosen,
    ...content.exercises.filter((e) => !chosen.includes(e) && e.refs.some((r) => refs.includes(r))),
  ];

  const exs = new Map<string, Example>();
  refs.forEach((r) => examplesFor(r).forEach((e) => exs.set(e.id, e)));
  const generated = shuffle([...exs.values()], rnd)
    .slice(0, max)
    .map((e, i) => fromExample(e, i, sessionWords, rnd, refs))
    .filter(Boolean) as Exercise[];

  const recycle = recycledRefs(data, session);
  const recycledEx = shuffle(recycle.flatMap((r) => examplesFor(r)), rnd)
    .filter((e) => !exs.has(e.id))
    .slice(0, 2)
    .map((e, i) => {
      const x = fromExample(e, i, sessionWords, rnd, recycle)!;
      return { ...x, id: `r-${e.id}`, prompt: `♻ ${x.prompt}` };
    });

  // escolha/associação primeiro, produção própria por último
  const order: Record<string, number> = { match: 0, choice: 1, fill: 2, build: 3, translate: 4, qa: 5, produce: 6 };
  return [...authored, ...generated.slice(0, Math.max(0, max - authored.length)), ...recycledEx]
    .sort((a, b) => order[a.type] - order[b.type]);
}
