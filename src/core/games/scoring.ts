/**
 * Pontuação comum a todos os jogos: cada rodada vale 100 pontos.
 *
 * Uma rodada é uma cruzada, uma leva de pares para ligar, um baralho de
 * flashcards ou um nível do Tetris. Os pontos da rodada são repartidos entre os
 * seus itens, de modo que acertar tudo dá exatamente 100 — e os jogos com vários
 * níveis por partida vão somando 100 por nível no placar final.
 */

export const ROUND_POINTS = 100;

/**
 * Reparte os pontos da rodada entre `count` itens em números inteiros que somam
 * exatamente o total (os primeiros itens ficam com o ponto que sobra da divisão).
 */
export function shares(count: number, total = ROUND_POINTS): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Quanto vale um item de uma rodada com `count` itens. */
export function shareOf(index: number, count: number, total = ROUND_POINTS): number {
  return shares(count, total)[index] ?? 0;
}

/** Pontos de quem completou `levels` rodadas inteiras. */
export function roundsScore(levels: number): number {
  return Math.max(0, Math.round(levels)) * ROUND_POINTS;
}
