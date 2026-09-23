import type { VocabItem } from './wordTetris';
import { shares } from './scoring';

/**
 * Jogo de ligar palavras: uma rodada tem N pares português ↔ inglês, com as
 * duas colunas embaralhadas cada uma na sua ordem.
 */

export const ROUND_SIZE = 8;

export interface MatchRound {
  pairs: VocabItem[];
  /** índices de `pairs` na ordem da coluna da esquerda (português) */
  left: number[];
  /** índices de `pairs` na ordem da coluna da direita (inglês) */
  right: number[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sorteia os pares da rodada sem repetir palavra em nenhuma das colunas — duas
 * palavras em inglês com a mesma tradução deixariam a ligação ambígua.
 */
export function newRound(pool: VocabItem[], size = ROUND_SIZE, avoid: string[] = []): MatchRound {
  const seenEn = new Set<string>();
  const seenPt = new Set<string>();
  const pick = (list: VocabItem[], out: VocabItem[]) => {
    for (const v of list) {
      if (out.length >= size) break;
      const en = v.en.toLowerCase();
      const pt = v.pt.toLowerCase();
      if (seenEn.has(en) || seenPt.has(pt)) continue;
      seenEn.add(en);
      seenPt.add(pt);
      out.push(v);
    }
  };
  const pairs: VocabItem[] = [];
  // prefere palavras que não estavam na rodada anterior; completa com o resto se faltar
  const fresh = shuffle(pool.filter((v) => !avoid.includes(v.en)));
  pick(fresh, pairs);
  pick(shuffle(pool), pairs);
  const idx = pairs.map((_, i) => i);
  return { pairs, left: shuffle(idx), right: shuffle(idx) };
}

/** Quanto vale cada par: os 100 pontos da rodada divididos entre eles. */
export function pairPoints(size: number): number[] {
  return shares(size);
}
