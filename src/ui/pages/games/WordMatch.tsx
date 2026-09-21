import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildVocabPool } from '../../../core/games/wordTetris';
import { newRound, pointsFor, type MatchRound } from '../../../core/games/wordMatch';
import { sheetsOf } from '../../../core/library/sheets';
import { speak } from '../../../core/lessons/lesson';
import { useData } from '../../hooks';
import { Crown, Praise } from '../../components/Doodles';
import { Empty } from '../../components/common';
import { GameTabs } from './GameTabs';

const BEST_KEY = 'word-match-best-streak';
/** Duração da chicotada inteira (estende, estala, recolhe). */
const WHIP_MS = 560;
/** Momento do estalo, em fração da chicotada. */
const CRACK_AT = 0.34;
const WRONG_MS = 480;

type Pt = { x: number; y: number };
type Geo = { a: Pt; b: Pt; hand: Pt };

const tilt = (i: number, side: number) => `${(((i * 37 + side * 11) % 5) - 2) * 0.55}deg`;

/** Tamanho da mão desenhada e comprimento do cabo, pra o chicote sair da ponta. */
const HAND_SCALE = 1.35;
const HANDLE = 13;

/** Para onde a mão mira (graus), limitado pra ela não ficar de ponta-cabeça. */
const aim = (g: Geo) =>
  Math.max(-35, Math.min(35, (Math.atan2(g.b.y - g.hand.y, g.b.x - g.hand.x) * 180) / Math.PI));

const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x ** 3;

/**
 * Posição da ponta do chicote e do resto da tira a cada instante (p de 0 a 1).
 * O chicote sai ondulado da mão, estica passando um pouco do alvo (o estalo),
 * volta um tiquinho e recolhe ondulando de novo.
 */
function lashPath(hand: Pt, target: Pt, p: number): string {
  const reach = p < CRACK_AT
    ? easeOut(p / CRACK_AT) * 1.05
    : p < 0.55
      ? 1.05 - 0.05 * ((p - CRACK_AT) / (0.55 - CRACK_AT))
      : 1 - easeIn((p - 0.55) / 0.45);
  const amp = p < CRACK_AT ? 24 * (1 - p / CRACK_AT) + 3 : p < 0.55 ? 3 : 3 + 16 * ((p - 0.55) / 0.45);
  const dx = target.x - hand.x;
  const dy = target.y - hand.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const N = 30;
  let d = '';
  for (let k = 0; k <= N; k++) {
    const s = k / N;
    const wave = amp * Math.sin(Math.PI * s) * Math.sin(2 * Math.PI * (1.3 * s - 2.4 * p));
    const x = hand.x + dx * s * reach + nx * wave;
    const y = hand.y + dy * s * reach + ny * wave;
    d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/**
 * Jogo de ligar palavras: português à esquerda, inglês à direita. Toque uma de
 * cada lado. Acertou: uma mão estala o chicote na palavra em inglês e fica uma
 * linha ligando a palavra à tradução. Errou: as duas tremem e a sequência zera.
 */
export function WordMatch() {
  const data = useData();
  // vocabulário do conteúdo + o que o usuário anotou nas folhas da Biblioteca
  const pool = useMemo(
    () => [...buildVocabPool(), ...sheetsOf(data).flatMap((s) => s.items)],
    [], // eslint-disable-line react-hooks/exhaustive-deps -- a rodada usa o que havia ao abrir o jogo
  );
  const [round, setRound] = useState<MatchRound>(() => newRound(pool));
  const [matched, setMatched] = useState<number[]>([]);
  const [linked, setLinked] = useState<number[]>([]);
  const [selL, setSelL] = useState<number | null>(null);
  const [selR, setSelR] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ l: number; r: number } | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const [whip, setWhip] = useState<{ i: number; key: number } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0) || 0);
  const [geo, setGeo] = useState<Record<number, Geo>>({});

  const board = useRef<HTMLDivElement>(null);
  const leftEls = useRef(new Map<number, HTMLButtonElement>());
  const rightEls = useRef(new Map<number, HTMLButtonElement>());
  const lash = useRef<SVGPathElement>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  // posição de cada par dentro do tabuleiro (pra linha e pro chicote)
  const measure = useCallback(() => {
    const box = board.current?.getBoundingClientRect();
    if (!box) return;
    const g: Record<number, Geo> = {};
    round.pairs.forEach((_, i) => {
      const l = leftEls.current.get(i)?.getBoundingClientRect();
      const r = rightEls.current.get(i)?.getBoundingClientRect();
      if (!l || !r) return;
      const y1 = l.top + l.height / 2 - box.top;
      const y2 = r.top + r.height / 2 - box.top;
      g[i] = {
        a: { x: l.right - box.left, y: y1 },
        b: { x: r.left - box.left, y: y2 },
        hand: { x: l.left - box.left + 52, y: y1 }, // mão por cima da palavra, inteira à vista
      };
    });
    setGeo(g);
  }, [round]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (board.current) ro.observe(board.current);
    return () => ro.disconnect();
  }, [measure]);

  // a chicotada, quadro a quadro
  useEffect(() => {
    if (!whip) return;
    const g = geo[whip.i];
    if (!g) return;
    const target = { x: g.b.x + 14, y: g.b.y };
    const ang = (aim(g) * Math.PI) / 180;
    const tip = { x: g.hand.x + Math.cos(ang) * HANDLE * HAND_SCALE, y: g.hand.y + Math.sin(ang) * HANDLE * HAND_SCALE };
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / WHIP_MS);
      lash.current?.setAttribute('d', lashPath(tip, target, p));
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [whip]); // eslint-disable-line react-hooks/exhaustive-deps

  const attempt = (l: number, r: number) => {
    setSelL(null);
    setSelR(null);
    if (l === r) {
      setMatched((m) => [...m, l]);
      setScore((s) => s + pointsFor(streak));
      const next = streak + 1;
      setStreak(next);
      if (next > best) {
        setBest(next);
        try { localStorage.setItem(BEST_KEY, String(next)); } catch { /* sem storage */ }
      }
      speak(round.pairs[l].en);
      setWhip({ i: l, key: Date.now() });
      later(() => { setHit(l); setLinked((k) => [...k, l]); }, WHIP_MS * CRACK_AT);
      later(() => setHit((h) => (h === l ? null : h)), WHIP_MS * CRACK_AT + 380);
      later(() => setWhip((w) => (w && w.i === l ? null : w)), WHIP_MS + 40);
    } else {
      setStreak(0);
      setWrong({ l, r });
      later(() => setWrong(null), WRONG_MS);
    }
  };

  const pickLeft = (i: number) => {
    if (matched.includes(i) || wrong) return;
    if (selR !== null) attempt(i, selR);
    else setSelL(selL === i ? null : i);
  };
  const pickRight = (i: number) => {
    if (matched.includes(i) || wrong) return;
    if (selL !== null) attempt(selL, i);
    else setSelR(selR === i ? null : i);
  };

  const nextRound = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setWhip(null);
    setMatched([]);
    setLinked([]);
    setSelL(null);
    setSelR(null);
    setRound((r) => newRound(pool, undefined, r.pairs.map((p) => p.en)));
  };

  if (pool.length < 3) {
    return <Empty>Adicione mais palavras em conteúdo para liberar o jogo.</Empty>;
  }

  const done = matched.length === round.pairs.length && !whip;
  const cls = (i: number, side: 'l' | 'r') => {
    const sel = side === 'l' ? selL === i : selR === i;
    const bad = wrong && (side === 'l' ? wrong.l === i : wrong.r === i);
    return [
      'mt-pill', side === 'l' ? 'mt-pt' : 'mt-en',
      matched.includes(i) && 'ok', sel && 'sel', bad && 'bad', side === 'r' && hit === i && 'hit',
    ].filter(Boolean).join(' ');
  };
  const wg = whip ? geo[whip.i] : undefined;
  const handAngle = wg ? aim(wg) : 0;

  return (
    <>
      <section className="hero wt-hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Ligar palavras</p>
        <h1>Ligue cada palavra à tradução</h1>
      </section>

      <GameTabs on="palavras" />

      <section className="mt-stats">
        <div><small>Pontuação</small><b>{score} <Crown className="mt-crown" width="22" /></b></div>
        <div>
          <small>Sequência atual</small>
          <b>
            <svg viewBox="0 0 20 24" width="16" className="mt-flame" aria-hidden>
              <path d="M10 1c1 5 7 7 7 14a7 7 0 0 1-14 0c0-4 2-6 3-8 1 3 2 4 3 4 0-4-1-7 1-10z" fill="currentColor" />
            </svg>
            {streak}
          </b>
        </div>
        <div><small>Melhor sequência</small><b>{best}</b></div>
      </section>

      <div className="mt-board" ref={board}>
        {round.left.map((i, row) => (
          <button
            key={`l${i}`}
            ref={(el) => { if (el) leftEls.current.set(i, el); else leftEls.current.delete(i); }}
            className={cls(i, 'l')}
            style={{ gridRow: row + 1, gridColumn: 1, '--tilt': tilt(i, 0) } as CSSProperties}
            onClick={() => pickLeft(i)}
            aria-pressed={selL === i}
            disabled={matched.includes(i)}
          >
            {round.pairs[i].pt}
          </button>
        ))}
        {round.left.map((_, row) => (
          <svg key={`w${row}`} viewBox="0 0 40 24" className="mt-mid" style={{ gridRow: row + 1, gridColumn: 2 }} aria-hidden>
            <path d="M6 4c7 2 11 6 13 12 1 4 5 5 8 2s7-4 9-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 2l5 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ))}
        {round.right.map((i, row) => (
          <button
            key={`r${i}`}
            ref={(el) => { if (el) rightEls.current.set(i, el); else rightEls.current.delete(i); }}
            className={cls(i, 'r')}
            style={{ gridRow: row + 1, gridColumn: 3, '--tilt': tilt(i, 1) } as CSSProperties}
            onClick={() => pickRight(i)}
            aria-pressed={selR === i}
            disabled={matched.includes(i)}
            lang="en"
          >
            {round.pairs[i].en}
          </button>
        ))}

        <svg className="mt-overlay" aria-hidden>
          {linked.map((i) => {
            const g = geo[i];
            if (!g) return null;
            const mx = (g.a.x + g.b.x) / 2;
            const sag = 8 + Math.abs(g.b.y - g.a.y) * 0.08;
            return (
              <path
                key={`line${i}`}
                className="mt-line"
                d={`M${g.a.x - 2} ${g.a.y} Q${mx} ${(g.a.y + g.b.y) / 2 + sag} ${g.b.x + 2} ${g.b.y}`}
                pathLength={1}
              />
            );
          })}
          {whip && wg && (
            <g key={whip.key}>
              <path ref={lash} className="mt-lash" d="" />
              <g transform={`translate(${wg.hand.x} ${wg.hand.y}) rotate(${handAngle}) scale(${HAND_SCALE})`}>
                <g className="mt-hand">
                  <path d="M-3 -2.4 L13 -1.4 L13 1.4 L-3 2.4 Z" className="mt-handle" />
                  <path d="M-19 -8c-7 0-8 4-8 8s1 8 8 8h9c5 0 6-3 6-6v-4c0-3-1-6-6-6z" className="mt-fist" />
                  <path d="M-15 -7.5v15M-10 -7.5v15M-5 -6.5v13" className="mt-knuckles" />
                  <path d="M-27 -5h-9M-27 5h-9M-36 -5v10" className="mt-sleeve" />
                </g>
              </g>
              <g transform={`translate(${wg.b.x + 14} ${wg.b.y})`}>
                <g className="mt-crack" style={{ animationDelay: `${WHIP_MS * CRACK_AT}ms` }}>
                  {[0, 60, 120, 180, 240, 300].map((a) => (
                    <path key={a} d="M9 0h9" transform={`rotate(${a})`} />
                  ))}
                </g>
              </g>
            </g>
          )}
        </svg>
      </div>

      {done ? (
        <section className="mt-done">
          <p className="praise-line"><Praise>rodada completa!</Praise></p>
          <button className="primary" onClick={nextRound}>Próxima rodada</button>
        </section>
      ) : (
        <p className="fc-tip">toque uma palavra de cada lado para ligar as duas</p>
      )}
    </>
  );
}
