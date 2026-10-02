import type { VocabItem } from './wordTetris';
import { content } from '../content/repository';
import { shares } from './scoring';

/**
 * Desafio Fala-Rápida: a palavra aparece em português e a pessoa diz em inglês.
 * Aqui fica a parte sem navegador: sortear a rodada e decidir se o que o
 * reconhecedor ouviu "parece" a palavra esperada.
 *
 * O reconhecedor devolve texto, mas quem aprende fala torto — então não se exige
 * texto idêntico: compara-se por semelhança, também pelo som aproximado, e
 * aceita-se qualquer uma das hipóteses.
 */

export const FAST_ROUND_SIZE = 8;
/** Segundos para começar a falar depois que a palavra aparece. */
export const FAST_SECONDS = 8;
/** Tentativas extras quando o áudio não deu pra entender (não conta como erro). */
export const FAST_RETRIES = 2;

export interface FastWord extends VocabItem {
  /** pronúncia aproximada em português, quando o conteúdo tem */
  respelling?: string;
}

export function newFastRound(pool: VocabItem[], size = FAST_ROUND_SIZE): FastWord[] {
  const respell = new Map<string, string>();
  content.words.forEach((w) => { if (w.pronunciation.respelling) respell.set(w.word.toLowerCase(), w.pronunciation.respelling); });
  const seen = new Set<string>();
  const single = pool.filter((v) => {
    const k = v.en.toLowerCase();
    // uma palavra só: o jogo é de fala rápida, não de frases
    if (/\s/.test(v.en.trim()) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const a = single.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, size).map((v) => ({ ...v, respelling: respell.get(v.en.toLowerCase()) }));
}

export const wordPoints = (size: number): number[] => shares(size);

// ---------- avaliação ----------

/** Palavras que soam iguais: dizer uma vale pela outra. */
const HOMOPHONES: string[][] = [
  ['to', 'too', 'two'], ['no', 'know'], ['write', 'right'], ['see', 'sea'], ['be', 'bee'],
  ['by', 'buy', 'bye'], ['for', 'four', 'fore'], ['hear', 'here'], ['one', 'won'],
  ['son', 'sun'], ['their', 'there', "they're"], ['wait', 'weight'], ['week', 'weak'], ['would', 'wood'],
  ['your', "you're"], ['its', "it's"], ['whole', 'hole'], ['eye', 'i', 'aye'],
  ['why', 'y'], ['oh', 'o', 'owe'], ['so', 'sew'], ['made', 'maid'], ['meet', 'meat'],
  ['piece', 'peace'], ['plain', 'plane'], ['tail', 'tale'], ['wear', 'where', 'ware'], ['which', 'witch'],
];

const HOMO = new Map<string, Set<string>>();
HOMOPHONES.forEach((g) => g.forEach((w) => {
  const s = HOMO.get(w) ?? new Set<string>();
  g.forEach((x) => s.add(x));
  HOMO.set(w, s);
}));

const NUMBERS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
  '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
};

/** Minúsculas, sem pontuação nem acento, e números por extenso (o Whisper escreve "2"). */
export function normalizeSpoken(text: string): string {
  const t = text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.split(' ').map((w) => NUMBERS[w] ?? w).join(' ');
}

/** Distância de edição (Levenshtein). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Som aproximado da palavra: junta grafias que soam parecido e, de quebra, os
 * erros típicos de quem fala inglês com sotaque do português (th → t/d/f, vogal
 * a mais no fim, h inicial mudo, d/t no fim).
 */
export function soundKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  w = w
    .replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^wh/, 'w').replace(/^ps/, 's')
    .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, '').replace(/th/g, 't')
    .replace(/sh|ch/g, 'x').replace(/qu/g, 'kw').replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's').replace(/y/g, 'i')
    .replace(/w/g, 'u').replace(/^h/, '')
    .replace(/(.)\1+/g, '$1');
  // vogais soam parecido demais pra separar: guarda só a primeira de cada grupo
  w = w.replace(/[aeiou]+/g, (m) => m[0]);
  // d/t, b/p, g/k, v/f trocados são o erro mais comum de pronúncia
  w = w.replace(/d/g, 't').replace(/b/g, 'p').replace(/g/g, 'k').replace(/v/g, 'f');
  // terminação vogal solta ("play" → "plei") não pesa
  return w.replace(/[eiou]$/, '');
}

/** 0 a 1: quanto `heard` se parece com `expected` (escrita ou som, o que der mais). */
export function similarity(expected: string, heard: string): number {
  const e = normalizeSpoken(expected);
  const h = normalizeSpoken(heard);
  if (!e || !h) return 0;
  if (e === h) return 1;
  if (HOMO.get(e)?.has(h)) return 1;
  const spelled = 1 - editDistance(e, h) / Math.max(e.length, h.length);
  const ke = soundKey(e);
  const kh = soundKey(h);
  if (!ke || !kh) return spelled;
  const sound = ke === kh ? 0.92 : 1 - editDistance(ke, kh) / Math.max(ke.length, kh.length);
  // pelo som vale um pouco menos que acertar a grafia
  return Math.max(spelled, sound * 0.95);
}

export type Verdict = 'ok' | 'close' | 'bad' | 'unclear';

export interface Judgement {
  verdict: Verdict;
  /** o que mais se aproximou do esperado */
  heard: string;
  score: number;
}

/**
 * Palavras curtas têm pouca margem: "cat" e "cut" só diferem em uma letra.
 * Por isso o limite sobe quando a palavra é curta.
 */
export function thresholdFor(word: string): number {
  const n = normalizeSpoken(word).length;
  if (n <= 3) return 0.78;
  if (n <= 5) return 0.72;
  return 0.68;
}

/** Textos que o Whisper solta quando só ouviu ruído ou silêncio. */
const NOISE = /^(thank you|thanks|you|bye|okay|ok|um+|uh+|hmm+|mm+|ah+|oh+|hm+)?$/;

export function cleanTranscript(raw: string): string {
  return normalizeSpoken(raw.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' '));
}

/**
 * Julga o que foi dito. `hypotheses` são as transcrições possíveis. Texto vazio,
 * ou só ruído que não é a palavra, vira "unclear" (não entendi) e não "bad":
 * quem não foi entendido merece nova chance, não um erro.
 */
export function judgeSpeech(expected: string, hypotheses: string[]): Judgement {
  const limit = thresholdFor(expected);
  let best = { heard: '', score: 0 };
  let any = '';
  for (const raw of hypotheses) {
    const text = cleanTranscript(raw);
    if (!text) continue;
    any = any || text;
    // a pessoa pode dizer "the play": vale a melhor palavra solta, ou o trecho inteiro
    const parts = [text, ...text.split(' ')];
    for (const p of parts) {
      const s = similarity(expected, p);
      if (s > best.score) best = { heard: p, score: s };
    }
  }
  if (!any) return { verdict: 'unclear', heard: '', score: 0 };
  if (best.score >= limit) {
    return { verdict: best.score >= 0.9 ? 'ok' : 'close', heard: best.heard, score: best.score };
  }
  if (NOISE.test(any) && normalizeSpoken(expected) !== any) return { verdict: 'unclear', heard: any, score: best.score };
  return { verdict: 'bad', heard: any, score: best.score };
}
