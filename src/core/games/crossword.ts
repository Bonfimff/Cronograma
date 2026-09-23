import type { VocabItem } from './wordTetris';

/**
 * Palavras cruzadas montadas na hora com o vocabulário do usuário: a palavra em
 * inglês é a resposta e a tradução em português é a dica. As palavras entram uma
 * a uma, sempre cruzando uma letra de outra já colocada.
 */

export type Dir = 'across' | 'down';

export interface Entry {
  num: number;
  dir: Dir;
  row: number;
  col: number;
  answer: string; // em maiúsculas, só A-Z
  word: string; // como aparece no vocabulário
  clue: string; // a tradução
}

export interface Crossword {
  rows: number;
  cols: number;
  /** letra esperada em cada casa, ou null quando a casa é preta */
  grid: (string | null)[][];
  entries: Entry[];
}

const GRID = 17; // espaço de trabalho; no fim o tabuleiro é aparado
const MIN_LEN = 3;
const MAX_LEN = 9;

/** Só palavras de uma peça, com letras de A a Z (sem espaço, hífen ou apóstrofo). */
export function crosswordWords(pool: VocabItem[]): VocabItem[] {
  const seen = new Set<string>();
  return pool.filter((v) => {
    const w = v.en.trim();
    const key = w.toUpperCase();
    if (!/^[A-Za-z]+$/.test(w) || w.length < MIN_LEN || w.length > MAX_LEN) return false;
    if (seen.has(key) || !v.pt.trim()) return false;
    seen.add(key);
    return true;
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Cell = string | null;
type Placed = { item: VocabItem; answer: string; row: number; col: number; dir: Dir };

const at = (g: Cell[][], r: number, c: number): Cell =>
  (r >= 0 && r < GRID && c >= 0 && c < GRID ? g[r][c] : null);

/**
 * A palavra cabe aqui? Precisa cruzar pelo menos uma letra igual, não brigar com
 * nenhuma letra já posta e não encostar de lado em outra palavra — senão apareceriam
 * pares de letras coladas que não formam palavra nenhuma.
 */
function fits(g: Cell[][], word: string, row: number, col: number, dir: Dir): boolean {
  const dr = dir === 'down' ? 1 : 0;
  const dc = dir === 'across' ? 1 : 0;
  const endR = row + dr * (word.length - 1);
  const endC = col + dc * (word.length - 1);
  if (row < 0 || col < 0 || endR >= GRID || endC >= GRID) return false;
  // as casas antes e depois da palavra precisam estar livres
  if (at(g, row - dr, col - dc) !== null || at(g, endR + dr, endC + dc) !== null) return false;

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cur = at(g, r, c);
    if (cur === word[i]) { crossings++; continue; }
    if (cur !== null) return false;
    // casa nova: não pode ter vizinho nos lados (só o cruzamento é permitido)
    const sideA = at(g, r + dc, c + dr);
    const sideB = at(g, r - dc, c - dr);
    if (sideA !== null || sideB !== null) return false;
  }
  return crossings > 0;
}

function put(g: Cell[][], word: string, row: number, col: number, dir: Dir) {
  for (let i = 0; i < word.length; i++) g[row + (dir === 'down' ? i : 0)][col + (dir === 'across' ? i : 0)] = word[i];
}

/**
 * Monta as cruzadas com até `max` palavras. Começa pela mais longa, no centro, e
 * vai encaixando as outras nos cruzamentos possíveis — preferindo as posições
 * mais próximas do centro, para o tabuleiro ficar compacto.
 */
export function buildCrossword(pool: VocabItem[], max = 8): Crossword {
  const words = shuffle(crosswordWords(pool)).sort((a, b) => b.en.length - a.en.length);
  const grid: Cell[][] = Array.from({ length: GRID }, () => Array<Cell>(GRID).fill(null));
  const placed: Placed[] = [];
  if (!words.length) return { rows: 0, cols: 0, grid: [], entries: [] };

  const first = words[0];
  const firstAnswer = first.en.toUpperCase();
  const mid = Math.floor(GRID / 2);
  put(grid, firstAnswer, mid, Math.max(0, mid - Math.floor(firstAnswer.length / 2)), 'across');
  placed.push({ item: first, answer: firstAnswer, row: mid, col: Math.max(0, mid - Math.floor(firstAnswer.length / 2)), dir: 'across' });

  for (const item of words.slice(1)) {
    if (placed.length >= max) break;
    const answer = item.en.toUpperCase();
    let best: { row: number; col: number; dir: Dir; score: number } | null = null;
    for (const p of placed) {
      const dir: Dir = p.dir === 'across' ? 'down' : 'across';
      for (let i = 0; i < p.answer.length; i++) {
        const pr = p.row + (p.dir === 'down' ? i : 0);
        const pc = p.col + (p.dir === 'across' ? i : 0);
        for (let j = 0; j < answer.length; j++) {
          if (answer[j] !== p.answer[i]) continue;
          const row = dir === 'down' ? pr - j : pr;
          const col = dir === 'across' ? pc - j : pc;
          if (!fits(grid, answer, row, col, dir)) continue;
          const score = Math.abs(row + (dir === 'down' ? answer.length / 2 : 0) - mid)
            + Math.abs(col + (dir === 'across' ? answer.length / 2 : 0) - mid);
          if (!best || score < best.score) best = { row, col, dir, score };
        }
      }
    }
    if (best) {
      put(grid, answer, best.row, best.col, best.dir);
      placed.push({ item, answer, row: best.row, col: best.col, dir: best.dir });
    }
  }

  // apara o tabuleiro no tamanho usado
  let top = GRID; let left = GRID; let bottom = -1; let right = -1;
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (grid[r][c]) {
    top = Math.min(top, r); left = Math.min(left, c); bottom = Math.max(bottom, r); right = Math.max(right, c);
  }
  const rows = bottom - top + 1;
  const cols = right - left + 1;
  const out = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => grid[top + r][left + c]));

  // numeração: cada casa que começa palavra ganha um número, de cima para baixo
  const starts = placed.map((p) => ({ ...p, row: p.row - top, col: p.col - left }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const numByCell = new Map<string, number>();
  let num = 0;
  const entries: Entry[] = starts.map((p) => {
    const key = `${p.row},${p.col}`;
    if (!numByCell.has(key)) numByCell.set(key, ++num);
    return { num: numByCell.get(key)!, dir: p.dir, row: p.row, col: p.col, answer: p.answer, word: p.item.en, clue: p.item.pt };
  });

  return { rows, cols, grid: out, entries };
}

/** As casas de uma palavra, na ordem. */
export function cellsOf(e: Entry): { row: number; col: number }[] {
  return Array.from({ length: e.answer.length }, (_, i) => ({
    row: e.row + (e.dir === 'down' ? i : 0),
    col: e.col + (e.dir === 'across' ? i : 0),
  }));
}

export const cellKey = (row: number, col: number) => `${row},${col}`;

/** A palavra está escrita certa no tabuleiro? */
export function isSolved(e: Entry, letters: Record<string, string>): boolean {
  return cellsOf(e).every((c, i) => (letters[cellKey(c.row, c.col)] ?? '') === e.answer[i]);
}

/** A palavra está toda preenchida (certa ou errada)? */
export function isFilled(e: Entry, letters: Record<string, string>): boolean {
  return cellsOf(e).every((c) => !!letters[cellKey(c.row, c.col)]);
}
