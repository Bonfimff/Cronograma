import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCrossword, cellKey, cellsOf, crosswordWords, isFilled, isSolved, type Crossword as Board, type Dir, type Entry } from '../../../core/games/crossword';
import { buildVocabPool } from '../../../core/games/wordTetris';
import { sheetsOf } from '../../../core/library/sheets';
import { speak } from '../../../core/lessons/lesson';
import { useData } from '../../hooks';
import { Empty } from '../../components/common';
import { Praise } from '../../components/Doodles';
import { NewspaperManLive } from '../../components/Cutouts';
import { GameTabs } from './GameTabs';

type Pos = { row: number; col: number };

const sameCell = (a: Pos, b: Pos) => a.row === b.row && a.col === b.col;

/** A palavra daquela direção que passa por esta casa. */
function entryAt(board: Board, pos: Pos, dir: Dir): Entry | undefined {
  return board.entries.find((e) => e.dir === dir && cellsOf(e).some((c) => sameCell(c, pos)));
}

/** Pontos de uma palavra: cheios, menos o que cada dica custou. */
const FULL = 100;
const HINT_COST = 30;
const MIN_POINTS = 20;
/** Desconto por desistir da palavra ("não sei"). */
const GIVE_UP_COST = 30;

const keyOf = (e: Entry) => `${e.num}${e.dir}`;

/**
 * Palavras cruzadas montadas com o vocabulário do usuário: a dica é a tradução
 * em português e a resposta é a palavra em inglês. Tocar numa casa escolhe a
 * palavra; tocar de novo troca entre a horizontal e a vertical. Cada palavra
 * completa é conferida na hora: certa fica verde e é pronunciada.
 *
 * Quem empaca pode pedir uma dica (abre uma letra e a palavra passa a valer
 * menos) ou dizer que não sabe (abre a palavra inteira, sem ponto e com
 * desconto).
 */
export function Crossword() {
  const data = useData();
  const pool = useMemo(
    () => [...buildVocabPool(), ...sheetsOf(data).flatMap((s) => s.items)],
    [], // eslint-disable-line react-hooks/exhaustive-deps -- usa o vocabulário de quando o jogo abriu
  );
  const [board, setBoard] = useState<Board>(() => buildCrossword(pool));
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [cur, setCur] = useState<Pos>(() => ({ row: board.entries[0]?.row ?? 0, col: board.entries[0]?.col ?? 0 }));
  const [dir, setDir] = useState<Dir>(() => board.entries[0]?.dir ?? 'across');
  const [wrong, setWrong] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [gaveUp, setGaveUp] = useState<string[]>([]);
  const cellRefs = useRef(new Map<string, HTMLInputElement>());
  const spoken = useRef(new Set<string>()); // palavras já pronunciadas nesta cruzada
  const scored = useRef(new Set<string>()); // palavras que já deram (ou não) ponto

  const active = entryAt(board, cur, dir) ?? entryAt(board, cur, dir === 'across' ? 'down' : 'across');
  const solved = board.entries.filter((e) => isSolved(e, letters));
  const done = board.entries.length > 0 && solved.length === board.entries.length;

  // confere cada palavra assim que ela fica completa
  useEffect(() => {
    const full = board.entries.filter((e) => isFilled(e, letters));
    const ok = full.find((e) => isSolved(e, letters) && !spoken.current.has(e.answer));
    if (ok) {
      spoken.current.add(ok.answer);
      speak(ok.word);
      const k = keyOf(ok);
      if (!scored.current.has(k)) {
        scored.current.add(k);
        setScore((n) => n + Math.max(MIN_POINTS, FULL - HINT_COST * (hints[k] ?? 0)));
      }
    }
    const bad = full.find((e) => !isSolved(e, letters));
    if (bad) {
      setWrong(`${bad.num}${bad.dir}`);
      const t = window.setTimeout(() => setWrong(null), 700);
      return () => window.clearTimeout(t);
    }
    setWrong(null);
  }, [letters, board, hints]);

  if (crosswordWords(pool).length < 2) {
    return (
      <>
        <section className="hero wt-hero"><p className="eyebrow"><a href="#/jogos">Jogos</a> · Cruzadas</p><h1>Palavras cruzadas</h1></section>
        <GameTabs on="cruzadas" />
        <Empty>Ainda faltam palavras: as cruzadas usam palavras de uma peça só, com 3 a 9 letras. Anote mais no conteúdo ou numa folha da Biblioteca.</Empty>
      </>
    );
  }

  const focus = (pos: Pos) => cellRefs.current.get(cellKey(pos.row, pos.col))?.focus();

  /** Anda para a casa seguinte (ou anterior) da palavra atual. */
  const step = (from: Pos, back = false): Pos | null => {
    if (!active) return null;
    const cells = cellsOf(active);
    const i = cells.findIndex((c) => sameCell(c, from));
    const next = cells[i + (back ? -1 : 1)];
    return next ?? null;
  };

  const pick = (pos: Pos) => {
    const both = entryAt(board, pos, 'across') && entryAt(board, pos, 'down');
    if (sameCell(pos, cur) && both) setDir(dir === 'across' ? 'down' : 'across');
    else if (!entryAt(board, pos, dir)) setDir(dir === 'across' ? 'down' : 'across');
    setCur(pos);
    focus(pos);
  };

  const type = (pos: Pos, value: string) => {
    const ch = value.slice(-1).toUpperCase();
    if (!/^[A-ZÀ-Ü]$/.test(ch)) return;
    setLetters((l) => ({ ...l, [cellKey(pos.row, pos.col)]: ch }));
    const next = step(pos);
    if (next) { setCur(next); focus(next); }
  };

  const erase = (pos: Pos) => {
    const key = cellKey(pos.row, pos.col);
    if (letters[key]) {
      setLetters((l) => { const n = { ...l }; delete n[key]; return n; });
      return;
    }
    const prev = step(pos, true);
    if (prev) {
      setLetters((l) => { const n = { ...l }; delete n[cellKey(prev.row, prev.col)]; return n; });
      setCur(prev); focus(prev);
    }
  };

  /** Abre a próxima letra que falta na palavra; ela passa a valer menos. */
  const hint = () => {
    if (!active || isSolved(active, letters)) return;
    const cells = cellsOf(active);
    const i = cells.findIndex((c, k) => (letters[cellKey(c.row, c.col)] ?? '') !== active.answer[k]);
    if (i < 0) return;
    setHints((h) => ({ ...h, [keyOf(active)]: (h[keyOf(active)] ?? 0) + 1 }));
    setLetters((l) => ({ ...l, [cellKey(cells[i].row, cells[i].col)]: active.answer[i] }));
  };

  /** Não sei: abre a palavra toda, sem ponto e com desconto. */
  const giveUp = () => {
    if (!active || isSolved(active, letters)) return;
    const k = keyOf(active);
    setGaveUp((g) => (g.includes(k) ? g : [...g, k]));
    scored.current.add(k); // aberta não dá ponto
    spoken.current.add(active.answer);
    setScore((n) => n - GIVE_UP_COST);
    setLetters((l) => {
      const next = { ...l };
      cellsOf(active).forEach((c, i) => { next[cellKey(c.row, c.col)] = active.answer[i]; });
      return next;
    });
    speak(active.word);
  };

  const restart = () => {
    const next = buildCrossword(pool);
    spoken.current = new Set();
    scored.current = new Set();
    setBoard(next);
    setLetters({});
    setWrong(null);
    setHints({});
    setGaveUp([]);
    setCur({ row: next.entries[0]?.row ?? 0, col: next.entries[0]?.col ?? 0 });
    setDir(next.entries[0]?.dir ?? 'across');
  };

  const activeCells = active ? cellsOf(active) : [];
  const listFor = (d: Dir) => board.entries.filter((e) => e.dir === d);

  return (
    <>
      <section className="hero wt-hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Cruzadas</p>
        <h1>Palavras cruzadas</h1>
      </section>

      <GameTabs on="cruzadas" />

      <section className="cw-stats">
        <span><b>{score}</b> pontos</span>
        <span><b>{solved.length}/{board.entries.length}</b> palavras</span>
      </section>

      <p className="cw-clue">
        {active ? <><b>{active.num} {active.dir === 'across' ? 'horizontal' : 'vertical'}:</b> {active.clue} <small>({active.answer.length} letras)</small></> : 'Toque numa casa para começar.'}
      </p>

      {/* o leitor de jornal fica ao lado do tabuleiro, sem cobrir casa nenhuma */}
      <div className="cw-stage">
        <div
          className="cw-grid"
          style={{ gridTemplateColumns: `repeat(${board.cols}, 1fr)`, maxWidth: `${board.cols * 42}px` }}
        >
        {board.grid.map((row, r) => row.map((letter, c) => {
          if (!letter) return <span key={`${r}-${c}`} className="cw-block" />;
          const key = cellKey(r, c);
          const start = board.entries.find((e) => e.row === r && e.col === c);
          const inActive = activeCells.some((x) => x.row === r && x.col === c);
          const ok = board.entries.some((e) => isSolved(e, letters) && cellsOf(e).some((x) => x.row === r && x.col === c));
          const open = board.entries.some((e) => gaveUp.includes(keyOf(e)) && cellsOf(e).some((x) => x.row === r && x.col === c));
          const bad = wrong && board.entries.some((e) => `${e.num}${e.dir}` === wrong && cellsOf(e).some((x) => x.row === r && x.col === c));
          return (
            <label key={key} className={`cw-cell ${inActive ? 'on' : ''} ${open ? 'open' : ok ? 'ok' : ''} ${bad ? 'bad' : ''} ${sameCell({ row: r, col: c }, cur) ? 'cur' : ''}`}>
              {start && <span className="cw-num">{start.num}</span>}
              <input
                ref={(el) => { if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key); }}
                value={letters[key] ?? ''}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={`linha ${r + 1}, coluna ${c + 1}`}
                onFocus={() => setCur({ row: r, col: c })}
                onClick={() => pick({ row: r, col: c })}
                onChange={(e) => type({ row: r, col: c }, e.target.value)}
                onKeyDown={(e) => {
                  const go = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
                  if (e.key === 'Backspace') { e.preventDefault(); erase({ row: r, col: c }); }
                  else if (go) {
                    e.preventDefault();
                    const pos = { row: r + go[0], col: c + go[1] };
                    if (board.grid[pos.row]?.[pos.col]) { setDir(go[0] ? 'down' : 'across'); setCur(pos); focus(pos); }
                  }
                }}
              />
            </label>
          );
        }))}
        </div>
        <NewspaperManLive className="cw-reader" width={78} />
      </div>

      <section className="cw-help">
        <button className="ghost small" onClick={hint} disabled={!active || isSolved(active, letters)}>
          Dica <small>−{HINT_COST}</small>
        </button>
        <button className="ghost small" onClick={giveUp} disabled={!active || isSolved(active, letters)}>
          Não sei <small>−{GIVE_UP_COST}</small>
        </button>
      </section>

      {done && (
        <section className="cw-done">
          <p className="praise-line"><Praise>tudo certo!</Praise></p>
          <p className="cw-final">{score} pontos</p>
          <button className="primary" onClick={restart}>Outra cruzada</button>
        </section>
      )}

      <section className="cw-clues">
        {(['across', 'down'] as Dir[]).map((d) => listFor(d).length > 0 && (
          <div key={d}>
            <h2>{d === 'across' ? 'Horizontais' : 'Verticais'}</h2>
            <ul>
              {listFor(d).map((e) => (
                <li key={`${e.num}${e.dir}`}>
                  <button
                    className={`cw-clue-btn ${gaveUp.includes(keyOf(e)) ? 'open' : isSolved(e, letters) ? 'ok' : ''} ${active === e ? 'on' : ''}`}
                    onClick={() => { setDir(e.dir); setCur({ row: e.row, col: e.col }); focus({ row: e.row, col: e.col }); }}
                  >
                    <b>{e.num}.</b> {e.clue} <small>({e.answer.length}{hints[keyOf(e)] ? ` · ${hints[keyOf(e)]} dica${hints[keyOf(e)] > 1 ? 's' : ''}` : ''})</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {!done && <button className="ghost small cw-new" onClick={restart}>Outra cruzada</button>}
    </>
  );
}
