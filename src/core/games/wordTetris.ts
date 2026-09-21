import { content } from '../content/repository';

export const COLS = 6;
export const ROWS = 9;

export type Cell = string | null; // cor da peça travada nessa célula, ou null se vazia
export type Board = Cell[][]; // ROWS x COLS, [0] = topo

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

function colTopRow(board: Board, col: number): number {
  for (let r = 0; r < ROWS; r++) if (board[r][col]) return r;
  return ROWS;
}

// ---------- Formas ----------

export interface Shape {
  cells: [number, number][]; // [linha, coluna] relativos ao canto superior esquerdo
  width: number;
  height: number;
  maxRowInCol: number[]; // por coluna da peça: maior linha ocupada (pra pouso e cálculo de buracos)
}

function shape(cells: [number, number][]): Shape {
  const width = Math.max(...cells.map((c) => c[1])) + 1;
  const height = Math.max(...cells.map((c) => c[0])) + 1;
  const maxRowInCol = Array.from({ length: width }, (_, c) =>
    Math.max(...cells.filter((cell) => cell[1] === c).map((cell) => cell[0])));
  return { cells, width, height, maxRowInCol };
}

/** Formas variadas (tamanho e silhueta), sempre com todas as colunas da caixa ocupadas por ao menos uma célula. */
export const SHAPES: Shape[] = [
  shape([[0, 0]]),
  shape([[0, 0], [0, 1]]),
  shape([[0, 0], [1, 0]]),
  shape([[0, 0], [0, 1], [0, 2]]),
  shape([[0, 0], [1, 0], [2, 0]]),
  shape([[0, 0], [0, 1], [1, 0], [1, 1]]),
  shape([[0, 0], [1, 0], [1, 1]]),
  shape([[0, 1], [1, 0], [1, 1]]),
  shape([[0, 0], [0, 1], [0, 2], [1, 1]]),
  shape([[0, 0], [0, 1], [1, 1], [1, 2]]),
  shape([[0, 1], [0, 2], [1, 0], [1, 1]]),
];

function pickShape(): Shape {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

/** Linha (offset superior) onde a peça repousa, dado o topo da pilha em cada coluna que ela ocupa. */
export function landingRow(board: Board, colStart: number, s: Shape): number {
  let top = ROWS;
  for (let c = 0; c < s.width; c++) {
    const avail = colTopRow(board, colStart + c) - 1 - s.maxRowInCol[c];
    top = Math.min(top, avail);
  }
  return top;
}

/** Buracos que a peça deixaria embaixo dela ao pousar em colStart. */
export function gapsFor(board: Board, colStart: number, s: Shape): number {
  const top = landingRow(board, colStart, s);
  if (top < 0) return Infinity;
  let gaps = 0;
  for (let c = 0; c < s.width; c++) {
    const bottomAbs = top + s.maxRowInCol[c];
    gaps += colTopRow(board, colStart + c) - 1 - bottomAbs;
  }
  return gaps;
}

/** Coluna que minimiza buracos — usada quando o jogador acerta a palavra. */
export function bestColumn(board: Board, s: Shape): number {
  let best = 0;
  let bestGaps = Infinity;
  for (let c = 0; c <= COLS - s.width; c++) {
    const g = gapsFor(board, c, s);
    if (g < bestGaps) { bestGaps = g; best = c; }
  }
  return best;
}

export function placePiece(board: Board, colStart: number, s: Shape, color: string): { board: Board; row: number } | null {
  const top = landingRow(board, colStart, s);
  if (top < 0) return null;
  const next = board.map((r) => r.slice());
  s.cells.forEach(([dr, dc]) => { next[top + dr][colStart + dc] = color; });
  return { board: next, row: top };
}

export function clearFullRows(board: Board): { board: Board; cleared: number } {
  const kept = board.filter((r) => r.some((c) => !c));
  const cleared = ROWS - kept.length;
  const filler = Array.from({ length: cleared }, () => Array<Cell>(COLS).fill(null));
  return { board: [...filler, ...kept], cleared };
}

export function randomStartCol(width: number): number {
  return Math.floor(Math.random() * (COLS - width + 1));
}

// ---------- Cores ----------

function hsl(h: number, s: number, l: number): string {
  const sf = s / 100;
  const lf = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sf * Math.min(lf, 1 - lf);
  const f = (n: number) => lf - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** 10 tons de verde (do escuro ao bem claro), com uma fração de azul (matiz sobe até a borda do ciano-esverdeado). */
export const GREEN_TONES = Array.from({ length: 10 }, (_, i) => hsl(130 + i * 5, 50, 26 + i * 6));
/** 10 tons de vermelho (do escuro ao bem claro), com uma fração de amarelo (matiz sobe até a borda do laranja-avermelhado). */
export const RED_TONES = Array.from({ length: 10 }, (_, i) => hsl(i * 4, 55, 28 + i * 6));
export const NEUTRAL_TONE = '#1f5c55';

/** Preto ou branco, o que der mais contraste em cima dessa cor de fundo. */
export function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#20201c' : '#ffffff';
}

export function randomTone(correct: boolean): string {
  const list = correct ? GREEN_TONES : RED_TONES;
  return list[Math.floor(Math.random() * list.length)];
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
  shape: Shape;
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
  return { en: item.en, pt: item.pt, options, shape: pickShape() };
}
