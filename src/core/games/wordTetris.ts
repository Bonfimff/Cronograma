import { content } from '../content/repository';

export const COLS = 6;
export const ROWS = 9;

export type Board = boolean[][]; // ROWS x COLS, [0] = topo, true = célula ocupada

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(false));
}

function colTopRow(board: Board, col: number): number {
  for (let r = 0; r < ROWS; r++) if (board[r][col]) return r;
  return ROWS;
}

/** Linha onde a peça repousa (topo da pilha mais alta entre as colunas que ela ocupa). */
export function landingRow(board: Board, colStart: number, width: number): number {
  let top = ROWS;
  for (let c = colStart; c < colStart + width; c++) top = Math.min(top, colTopRow(board, c));
  return top - 1;
}

/** Buracos que a peça deixaria embaixo dela ao pousar em colStart. */
export function gapsFor(board: Board, colStart: number, width: number): number {
  const row = landingRow(board, colStart, width);
  if (row < 0) return Infinity;
  let gaps = 0;
  for (let c = colStart; c < colStart + width; c++) gaps += colTopRow(board, c) - 1 - row;
  return gaps;
}

/** Coluna que minimiza buracos — usada quando o jogador acerta a palavra. */
export function bestColumn(board: Board, width: number): number {
  let best = 0;
  let bestGaps = Infinity;
  for (let c = 0; c <= COLS - width; c++) {
    const g = gapsFor(board, c, width);
    if (g < bestGaps) { bestGaps = g; best = c; }
  }
  return best;
}

export function placePiece(board: Board, colStart: number, width: number): { board: Board; row: number } | null {
  const row = landingRow(board, colStart, width);
  if (row < 0) return null;
  const next = board.map((r) => r.slice());
  for (let c = colStart; c < colStart + width; c++) next[row][c] = true;
  return { board: next, row };
}

export function clearFullRows(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((r) => r.some((c) => !c));
  const cleared = ROWS - kept.length;
  const filler = Array.from({ length: cleared }, () => Array(COLS).fill(false));
  return { board: [...filler, ...kept], cleared };
}

export function randomStartCol(width: number): number {
  return Math.floor(Math.random() * (COLS - width + 1));
}

// ---------- Vocabulário (peças) ----------

export interface VocabItem {
  en: string;
  pt: string;
}

function clean(text: string): string {
  return text.replace(/\([^)]*\)/g, '').split('/')[0].trim();
}

/** Monta o banco de pares EN→PT a partir do vocabulário atual (words.json + conteúdo do usuário). */
export function buildVocabPool(): VocabItem[] {
  const seen = new Set<string>();
  const pool: VocabItem[] = [];
  const add = (en: string, ptRaw: string) => {
    const pt = clean(ptRaw);
    const key = en.toLowerCase();
    if (!en || !pt || seen.has(key)) return;
    seen.add(key);
    pool.push({ en, pt });
  };
  content.words.forEach((w) => {
    const first = w.translations.find((t) => clean(t.text));
    if (first) add(w.word, first.text);
    w.variations.forEach((v) => {
      if (v.meaning.includes('contração')) return;
      add(v.form, v.meaning);
    });
  });
  return pool;
}

export interface Piece {
  en: string;
  pt: string;
  options: string[];
  width: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A peça mostra a palavra em português; as opções são as traduções em inglês (uma certa + 3 erradas). */
export function pickPiece(pool: VocabItem[], avoidEn?: string): Piece {
  const choices = pool.length > 1 ? pool.filter((v) => v.en !== avoidEn) : pool;
  const item = choices[Math.floor(Math.random() * choices.length)];
  const distractors = shuffle(pool.filter((v) => v.en.toLowerCase() !== item.en.toLowerCase()))
    .slice(0, 3)
    .map((v) => v.en);
  const options = shuffle([item.en, ...distractors]);
  const width = Math.min(3, Math.max(1, Math.ceil(item.pt.length / 5)));
  return { en: item.en, pt: item.pt, options, width };
}
