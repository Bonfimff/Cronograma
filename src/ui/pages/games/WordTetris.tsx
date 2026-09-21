import { useEffect, useRef, useState } from 'react';
import {
  COLS, NEUTRAL_TONE, ROWS, bestColumn, buildVocabPool, clearFullRows, contrastText, emptyBoard, landingRow,
  levelFor, pickPiece, placePiece, randomStartCol, randomTone, timeLimitFor, type Board, type Piece, type WordStats,
} from '../../../core/games/wordTetris';
import { speak } from '../../../core/lessons/lesson';
import { Empty } from '../../components/common';

const BEST_KEY = 'word-tetris-best';
const STATS_KEY = 'word-tetris-word-stats';
const DROP_MS = 320;

type Falling = { piece: Piece; col: number; row: number; color: string; dropping: boolean };

const pct = (n: number, total: number) => `${(n / total) * 100}%`;

function loadStats(): WordStats {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch { return {}; }
}

export function WordTetris() {
  const [pool] = useState(buildVocabPool);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [falling, setFalling] = useState<Falling | null>(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0) || 0);
  const [over, setOver] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(1);
  const timeoutRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<number | undefined>(undefined);
  const lastEnRef = useRef<string | undefined>(undefined);
  const statsRef = useRef<WordStats | null>(null);
  if (statsRef.current === null) statsRef.current = loadStats();

  const recordStat = (en: string, correct: boolean) => {
    const cur = statsRef.current![en] ?? { c: 0, w: 0 };
    statsRef.current = { ...statsRef.current, [en]: correct ? { c: cur.c + 1, w: cur.w } : { c: cur.c, w: cur.w + 1 } };
    try { localStorage.setItem(STATS_KEY, JSON.stringify(statsRef.current)); } catch { /* sem storage disponível */ }
  };

  /**
   * Resolve a peça atual. Recebe peça/coluna/tabuleiro explicitamente em vez de ler o state:
   * o timeout de "tempo esgotado" é agendado no momento em que a peça nasce, então um `falling`
   * lido do state nesse fechamento estaria sempre desatualizado (ainda null, de antes do spawn).
   */
  const finish = (piece: Piece, spawnCol: number, boardAtSpawn: Board, correct: boolean) => {
    window.clearTimeout(timeoutRef.current);
    window.clearInterval(intervalRef.current);
    const targetCol = correct ? bestColumn(boardAtSpawn, piece.shape) : spawnCol;
    const color = randomTone(correct);
    const placed = placePiece(boardAtSpawn, targetCol, piece.shape, color);
    if (!placed) { setOver(true); return; }
    if (correct) speak(piece.en);
    recordStat(piece.en, correct);
    setToast({
      ok: correct,
      text: correct ? `✓ ${piece.pt} = ${piece.en}` : `${piece.pt} = ${piece.en} — a peça caiu torta.`,
    });
    setFalling({ piece, col: targetCol, row: placed.row, color, dropping: true });
    window.setTimeout(() => {
      const { board: cleared, cleared: n } = clearFullRows(placed.board);
      const newScore = score + (correct ? 100 + streak * 20 : 0) + n * 150;
      setBoard(cleared);
      setLines((l) => l + n);
      setScore(newScore);
      setStreak((s) => (correct ? s + 1 : 0));
      setToast(null);
      setFalling(null);
      spawnPiece(cleared, newScore);
    }, DROP_MS);
  };

  /** Dispara a peça seguinte; recebe o tabuleiro e a pontuação atuais explicitamente (o state ainda pode não ter comitado). */
  const spawnPiece = (currentBoard: Board, currentScore: number) => {
    if (pool.length < 4) return;
    const level = levelFor(currentScore);
    const piece = pickPiece(pool, level, statsRef.current!, lastEnRef.current);
    lastEnRef.current = piece.en;
    const col = randomStartCol(piece.shape.width);
    if (landingRow(currentBoard, col, piece.shape) < 0) { setOver(true); return; }
    setFalling({ piece, col, row: 0, color: NEUTRAL_TONE, dropping: false });
    setTimeLeft(1);
    const limit = timeLimitFor(level);
    const start = Date.now();
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(Math.max(0, 1 - (Date.now() - start) / limit));
    }, 100);
    timeoutRef.current = window.setTimeout(() => finish(piece, col, currentBoard, false), limit);
  };

  useEffect(() => {
    spawnPiece(emptyBoard(), 0);
    return () => { window.clearTimeout(timeoutRef.current); window.clearInterval(intervalRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (over && score > best) {
      setBest(score);
      try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* sem storage disponível */ }
    }
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    setScore(0);
    setLines(0);
    setStreak(0);
    setToast(null);
    setOver(false);
    lastEnRef.current = undefined;
    setBoard(emptyBoard());
    spawnPiece(emptyBoard(), 0);
  };

  if (pool.length < 4) {
    return (
      <>
        <section className="hero">
          <p className="eyebrow">Jogos</p>
          <h1>Tetris de vocabulário</h1>
        </section>
        <Empty>Adicione mais palavras em conteúdo para liberar o jogo (mínimo de 4).</Empty>
        <a className="ghost" href="#/jogos">Voltar</a>
      </>
    );
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Tetris de vocabulário</p>
        <h1>Traduza antes que a peça caia</h1>
      </section>

      <section className="wt-stats">
        <span><b>{score}</b> pontos</span>
        <span><b>{levelFor(score)}</b> nível</span>
        <span><b>{streak}</b> sequência</span>
        <span><b>{lines}</b> linhas</span>
        <span><b>{best}</b> recorde</span>
      </section>

      <section>
        <div className="wt-board">
          {board.map((row, r) => row.map((cell, c) => cell && (
            <div
              key={`${r}-${c}`}
              className="wt-cell"
              style={{ top: pct(r, ROWS), left: pct(c, COLS), width: pct(1, COLS), height: pct(1, ROWS), background: cell }}
            />
          )))}
          {falling && falling.piece.shape.cells.map(([dr, dc], i) => (
            <div
              key={i}
              className={`wt-piece-cell ${falling.dropping ? 'dropping' : ''}`}
              style={{
                top: pct(falling.row + dr, ROWS), left: pct(falling.col + dc, COLS),
                width: pct(1, COLS), height: pct(1, ROWS), background: falling.color,
              }}
            />
          ))}
          {falling && (
            <div
              className={`wt-piece-label ${falling.dropping ? 'dropping' : ''}`}
              style={{
                top: pct(falling.row, ROWS), left: pct(falling.col, COLS),
                width: pct(falling.piece.shape.width, COLS), height: pct(falling.piece.shape.height, ROWS),
                color: contrastText(falling.color),
                textShadow: contrastText(falling.color) === '#ffffff' ? '0 1px 2px rgba(0,0,0,.4)' : 'none',
              }}
            >
              {falling.piece.pt}
            </div>
          )}
        </div>
        {falling && !falling.dropping && (
          <div className="wt-timer"><span style={{ width: `${timeLeft * 100}%` }} /></div>
        )}
      </section>

      {toast && <p className={toast.ok ? 'ok-line' : 'warn'}>{toast.text}</p>}

      {falling && !falling.dropping && (
        <section className="wt-options">
          {falling.piece.options.map((opt) => (
            <button key={opt} className="ghost" onClick={() => finish(falling.piece, falling.col, board, opt === falling.piece.en)}>{opt}</button>
          ))}
        </section>
      )}

      {over && (
        <section className="actions left">
          <div className="wt-gameover">
            <p className="big-line">Fim de jogo — {score} pontos{score >= best && score > 0 ? ' (novo recorde!)' : ''}</p>
          </div>
          <button className="primary" onClick={restart}>Jogar de novo</button>
          <a className="ghost" href="#/jogos">Voltar aos jogos</a>
        </section>
      )}
    </>
  );
}
