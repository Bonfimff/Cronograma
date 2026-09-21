import { useEffect, useRef, useState } from 'react';
import {
  COLS, ROWS, bestColumn, buildVocabPool, clearFullRows, emptyBoard, landingRow,
  pickPiece, placePiece, randomStartCol, type Board, type Piece,
} from '../../../core/games/wordTetris';
import { Empty } from '../../components/common';

const TIME_LIMIT = 8000;
const BEST_KEY = 'word-tetris-best';
const DROP_MS = 320;

type Falling = { piece: Piece; col: number; row: number; dropping: boolean };

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

  /**
   * Resolve a peça atual. Recebe peça/coluna/tabuleiro explicitamente em vez de ler o state:
   * o timeout de "tempo esgotado" é agendado no momento em que a peça nasce, então um `falling`
   * lido do state nesse fechamento estaria sempre desatualizado (ainda null, de antes do spawn).
   */
  const finish = (piece: Piece, spawnCol: number, boardAtSpawn: Board, correct: boolean) => {
    window.clearTimeout(timeoutRef.current);
    window.clearInterval(intervalRef.current);
    const width = piece.width;
    const targetCol = correct ? bestColumn(boardAtSpawn, width) : spawnCol;
    const placed = placePiece(boardAtSpawn, targetCol, width);
    if (!placed) { setOver(true); return; }
    setToast({
      ok: correct,
      text: correct ? `✓ ${piece.pt} = ${piece.en}` : `${piece.pt} = ${piece.en} — a peça caiu torta.`,
    });
    setFalling({ piece, col: targetCol, row: placed.row, dropping: true });
    window.setTimeout(() => {
      const { board: cleared, cleared: n } = clearFullRows(placed.board);
      setBoard(cleared);
      setLines((l) => l + n);
      setScore((s) => s + (correct ? 100 + streak * 20 : 0) + n * 150);
      setStreak((s) => (correct ? s + 1 : 0));
      setToast(null);
      setFalling(null);
      spawnPiece(cleared);
    }, DROP_MS);
  };

  /** Dispara a peça seguinte; recebe o tabuleiro atual explicitamente (o state ainda pode não ter comitado). */
  const spawnPiece = (currentBoard: Board) => {
    if (pool.length < 4) return;
    const piece = pickPiece(pool, lastEnRef.current);
    lastEnRef.current = piece.en;
    const col = randomStartCol(piece.width);
    if (landingRow(currentBoard, col, piece.width) < 0) { setOver(true); return; }
    setFalling({ piece, col, row: 0, dropping: false });
    setTimeLeft(1);
    const start = Date.now();
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(Math.max(0, 1 - (Date.now() - start) / TIME_LIMIT));
    }, 100);
    timeoutRef.current = window.setTimeout(() => finish(piece, col, currentBoard, false), TIME_LIMIT);
  };

  useEffect(() => {
    spawnPiece(emptyBoard());
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
    spawnPiece(emptyBoard());
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
        <span><b>{streak}</b> sequência</span>
        <span><b>{lines}</b> linhas</span>
        <span><b>{best}</b> recorde</span>
      </section>

      <section>
        <div className="wt-board">
          {board.map((row, r) => row.map((cell, c) => cell && (
            <div key={`${r}-${c}`} className="wt-cell" style={{ top: `${(r / ROWS) * 100}%`, left: `${(c / COLS) * 100}%`, width: `${100 / COLS}%`, height: `${100 / ROWS}%` }} />
          )))}
          {falling && (
            <div
              className={`wt-piece ${falling.dropping ? 'dropping' : ''}`}
              style={{
                top: `${(falling.row / ROWS) * 100}%`,
                left: `${(falling.col / COLS) * 100}%`,
                width: `${(falling.piece.width / COLS) * 100}%`,
                height: `${100 / ROWS}%`,
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
