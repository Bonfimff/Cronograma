import { useEffect, useRef, useState } from 'react';
import {
  COLS, DANGER_AT, NEUTRAL_TONE, ROWS, bestColumn, buildVocabPool, clearFullRows, contrastText, emptyBoard,
  fitsAnywhere, levelFor, pickPiece, pickShapeFor, placePiece, randomTone, spawnColumn, stackHeight, wordPoints,
  timeLimitFor, wrongColumn, type Board, type Piece, type WordStats,
} from '../../../core/games/wordTetris';
import { speak } from '../../../core/lessons/lesson';
import { GAME_KEYS } from '../../../core/storage/backup';
import { Empty } from '../../components/common';
import { StarBadge } from '../../components/Doodles';
import { GoatTalking } from '../../components/Cutouts';
import { GameTabs } from './GameTabs';

const BEST_KEY = GAME_KEYS.tetrisBest;
const STATS_KEY = GAME_KEYS.tetrisWordStats;
const DROP_MS = 320;
/** Quantas respostas recentes contam pra decidir se o jogador "vem acertando". */
const RECENT = 8;
/** Acima desse aproveitamento recente, um erro perto do topo não encerra a partida. */
const LENIENT_ACCURACY = 0.7;

type Falling = { piece: Piece; col: number; row: number; color: string; dropping: boolean };
type Current = { piece: Piece; col: number; board: Board; limit: number; start: number };

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
  const [paused, setPaused] = useState(false);
  const [levelUp, setLevelUp] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(1);
  const timeoutRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<number | undefined>(undefined);
  const lastEnRef = useRef<string | undefined>(undefined);
  const currentRef = useRef<Current | null>(null);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const recentRef = useRef<boolean[]>([]);

  /** O jogador vem acertando quase tudo? (com poucas respostas ainda, assume que sim) */
  const doingWell = () => {
    const recent = recentRef.current;
    return recent.length < 4 || recent.filter(Boolean).length / recent.length >= LENIENT_ACCURACY;
  };
  const statsRef = useRef<WordStats | null>(null);
  if (statsRef.current === null) statsRef.current = loadStats();

  const clearTimers = () => {
    window.clearTimeout(timeoutRef.current);
    window.clearInterval(intervalRef.current);
  };

  const recordStat = (en: string, correct: boolean) => {
    const cur = statsRef.current![en] ?? { c: 0, w: 0 };
    statsRef.current = { ...statsRef.current, [en]: correct ? { c: cur.c + 1, w: cur.w } : { c: cur.c, w: cur.w + 1 } };
    try { localStorage.setItem(STATS_KEY, JSON.stringify(statsRef.current)); } catch { /* sem storage disponível */ }
  };

  /**
   * Resolve a peça atual. Recebe peça/coluna/tabuleiro explicitamente em vez de ler o state:
   * o timeout de "tempo esgotado" é agendado quando a peça nasce, então um `falling` lido do
   * state nesse fechamento estaria sempre desatualizado. Pontos e sequência vêm de refs pelo
   * mesmo motivo — o fechamento do timeout guarda valores de um render anterior.
   */
  const finish = (piece: Piece, spawnCol: number, boardAtSpawn: Board, correct: boolean) => {
    clearTimers();
    currentRef.current = null;
    // o aproveitamento é medido antes de contar esta resposta
    const lenient = stackHeight(boardAtSpawn) >= DANGER_AT && doingWell();
    recentRef.current = [...recentRef.current, correct].slice(-RECENT);
    const targetCol = correct
      ? bestColumn(boardAtSpawn, piece.shape)
      : wrongColumn(boardAtSpawn, piece.shape, spawnCol, lenient);
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
      const before = scoreRef.current;
      // cada acerto vale uma fatia do nível: WORDS_PER_LEVEL acertos fecham os 100 pontos
      const newScore = before + (correct ? wordPoints() : 0);
      scoreRef.current = newScore;
      streakRef.current = correct ? streakRef.current + 1 : 0;
      if (levelFor(newScore) > levelFor(before)) {
        setLevelUp(true);
        window.setTimeout(() => setLevelUp(false), 1800);
      }
      setBoard(cleared);
      setLines((l) => l + n);
      setScore(newScore);
      setStreak(streakRef.current);
      setToast(null);
      setFalling(null);
      spawnPiece(cleared, newScore);
    }, DROP_MS);
  };

  const runTimers = (c: Current) => {
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(Math.max(0, 1 - (Date.now() - c.start) / c.limit));
    }, 100);
    const remaining = Math.max(0, c.limit - (Date.now() - c.start));
    timeoutRef.current = window.setTimeout(() => finish(c.piece, c.col, c.board, false), remaining);
  };

  /** Dispara a peça seguinte; recebe tabuleiro e pontuação atuais (o state ainda pode não ter comitado). */
  const spawnPiece = (currentBoard: Board, currentScore: number) => {
    if (pool.length < 4) return;
    const level = levelFor(currentScore);
    const shape = pickShapeFor(currentBoard, level, doingWell());
    const piece = pickPiece(pool, level, statsRef.current!, shape, lastEnRef.current);
    lastEnRef.current = piece.en;
    // só acaba se a peça não couber em lugar nenhum — não pela coluna sorteada
    if (!fitsAnywhere(currentBoard, piece.shape)) { setOver(true); return; }
    const col = spawnColumn(currentBoard, piece.shape);
    setFalling({ piece, col, row: 0, color: NEUTRAL_TONE, dropping: false });
    setTimeLeft(1);
    const c: Current = { piece, col, board: currentBoard, limit: timeLimitFor(level), start: Date.now() };
    currentRef.current = c;
    runTimers(c);
  };

  const togglePause = () => {
    const c = currentRef.current;
    if (!c || over) return;
    if (paused) {
      // retoma de onde parou: recua o início pelo tempo já gasto antes da pausa
      const elapsed = c.limit * (1 - timeLeft);
      const resumed = { ...c, start: Date.now() - elapsed };
      currentRef.current = resumed;
      runTimers(resumed);
      setPaused(false);
    } else {
      clearTimers();
      setPaused(true);
    }
  };

  useEffect(() => {
    spawnPiece(emptyBoard(), 0);
    return clearTimers;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (over && score > best) {
      setBest(score);
      try { localStorage.setItem(BEST_KEY, String(score)); } catch { /* sem storage disponível */ }
    }
  }, [over]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    clearTimers();
    scoreRef.current = 0;
    streakRef.current = 0;
    recentRef.current = [];
    lastEnRef.current = undefined;
    setScore(0);
    setLines(0);
    setStreak(0);
    setToast(null);
    setOver(false);
    setPaused(false);
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

  const answering = falling && !falling.dropping && !paused && !over;

  return (
    <>
      <section className="hero wt-hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Tetris de vocabulário</p>
        <h1>Traduza antes que a peça caia</h1>
      </section>

      <GameTabs on="tetris" />

      <section className="wt-stats">
        <span><b>{score}</b> pontos</span>
        <span><b>{levelFor(score)}</b> nível</span>
        <span><b>{streak}</b> sequência</span>
        <span><b>{lines}</b> linhas</span>
        <span><b>{best}</b> recorde</span>
      </section>

      <section>
        <div className="wt-stage">
          {levelUp && <StarBadge className="wt-levelup">level<br />up!</StarBadge>}
          <div className={`wt-board ${over ? 'over' : ''}`}>
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
          {over && (
            <div className="wt-over">
              <div className="goat-stage">
                <GoatTalking width={92} />
                <span className="goat-balloon"><b>Béééééééé!</b></span>
              </div>
              <p className="wt-over-line">
                Fim de jogo.{' '}
                {score >= best && score > 0 ? <><b>Novo recorde: {score} pontos!</b></> : <>{score} pontos.</>}
              </p>
            </div>
          )}
        </div>
        {falling && !falling.dropping && (
          <div className={`wt-timer ${timeLeft < .3 ? 'hurry' : ''}`}>
            <span style={{ width: `${timeLeft * 100}%` }} />
          </div>
        )}
        {!over && (
          <div className="wt-controls">
            <button className="ghost" onClick={togglePause} aria-label={paused ? 'Continuar' : 'Pausar'}>{paused ? '▶' : '❚❚'}</button>
            <button className="ghost" onClick={restart} aria-label="Recomeçar">↻</button>
          </div>
        )}
      </section>

      {paused && !over && <p className="wt-paused">pausado</p>}
      {toast && <p className={toast.ok ? 'ok-line' : 'warn'}>{toast.text}</p>}

      {answering && (
        <section className="wt-options">
          {falling.piece.options.map((opt) => (
            <button key={opt} className="ghost" onClick={() => finish(falling.piece, falling.col, board, opt === falling.piece.en)}>{opt}</button>
          ))}
        </section>
      )}

      {over && (
        <section className="actions left">
          <p className="wt-quip">
            “Toda vez que eu me deparo com essa situação aqui, me dá vontade de berrar, é isso…”
          </p>
          <button className="primary" onClick={restart}>Jogar de novo</button>
          <a className="ghost" href="#/jogos">Voltar aos jogos</a>
        </section>
      )}
    </>
  );
}
