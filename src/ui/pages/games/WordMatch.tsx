import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildVocabPool } from '../../../core/games/wordTetris';
import { newRound, pointsFor, type MatchRound } from '../../../core/games/wordMatch';
import { sheetsOf } from '../../../core/library/sheets';
import { speak } from '../../../core/lessons/lesson';
import { playCrack, primeAudio } from '../../sfx';
import { useData } from '../../hooks';
import { Crown, Praise } from '../../components/Doodles';
import { Empty } from '../../components/common';
import { GameTabs } from './GameTabs';

const BEST_KEY = 'word-match-best-streak';
/** Duração da chicotada inteira: toma impulso, golpeia, estala, recolhe. */
const WHIP_MS = 1150;
/** Fases, em fração da chicotada: fim do impulso, estalo, fim do tranco. */
const WIND_END = 0.3;
const CRACK_AT = 0.46;
const HOLD_END = 0.62;
/** A pronúncia vem logo depois do estalo, não por cima dele. */
const SPEAK_DELAY = 320;
const WRONG_MS = 480;

type Pt = { x: number; y: number };
type Geo = { a: Pt; b: Pt; hand: Pt };

const tilt = (i: number, side: number) => `${(((i * 37 + side * 11) % 5) - 2) * 0.55}deg`;

/** Tamanho da mão desenhada e comprimento do cabo, pra o chicote sair da ponta. */
const HAND_SCALE = 1.35;
const HANDLE = 22;
/** Trechos do chicote: cada um mais fino que o anterior (couro trançado afinando). */
const SEGMENTS = 12;
/** Espessura de cada trecho: grossa junto do cabo, fina na ponta. */
const segWidth = (k: number) => 5.4 * (1 - k / SEGMENTS) ** 0.9 + 0.9;

/** Para onde a mão mira (graus), limitado pra ela não ficar de ponta-cabeça. */
const aim = (g: Geo) =>
  Math.max(-35, Math.min(35, (Math.atan2(g.b.y - g.hand.y, g.b.x - g.hand.x) * 180) / Math.PI));

/**
 * Balanço da mão ao longo da chicotada: toma impulso pra trás, desce com tudo
 * no estalo, segura e some. Fica aqui (e não no CSS) porque o fio do chicote
 * precisa sair da ponta do cabo exatamente onde a mão estiver.
 */
const SWING = [
  { p: 0, rot: -8, tx: 0, op: 0 },
  { p: 0.08, rot: -18, tx: -2, op: 1 },
  { p: WIND_END, rot: -48, tx: -6, op: 1 },
  { p: CRACK_AT, rot: 22, tx: 6, op: 1 },
  { p: HOLD_END, rot: 10, tx: 0, op: 1 },
  { p: 1, rot: -4, tx: 0, op: 0 },
];
function swingAt(p: number) {
  let i = 0;
  while (i < SWING.length - 2 && p > SWING[i + 1].p) i++;
  const a = SWING[i];
  const b = SWING[i + 1];
  const q = Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p)));
  const k = q * q * (3 - 2 * q); // suave na chegada e na saída de cada pose
  return { rot: a.rot + (b.rot - a.rot) * k, tx: a.tx + (b.tx - a.tx) * k, op: a.op + (b.op - a.op) * k };
}

const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeIn = (x: number) => x ** 3;

/**
 * A tira do chicote a cada instante (p de 0 a 1). Primeiro fica enrolada perto
 * da mão, balançando (impulso); no golpe estica acelerando e passa um pouco do
 * alvo, esticada e reta (o estalo); dá um tranco de volta e recolhe ondulando.
 */
function lashPoints(hand: Pt, target: Pt, p: number): Pt[] {
  let reach: number;
  let amp: number;
  if (p < WIND_END) {
    const q = p / WIND_END;
    reach = 0.12 + 0.06 * Math.sin(q * Math.PI);
    amp = 18;
  } else if (p < CRACK_AT) {
    const q = (p - WIND_END) / (CRACK_AT - WIND_END);
    reach = 0.12 + 0.98 * easeIn(q); // acelera até o estalo
    amp = 18 * (1 - q) + 1.5;
  } else if (p < HOLD_END) {
    const q = (p - CRACK_AT) / (HOLD_END - CRACK_AT);
    reach = 1.1 - 0.1 * easeOut(q);
    amp = 1.5 + 4 * Math.sin(q * Math.PI * 3) * (1 - q);
  } else {
    const q = (p - HOLD_END) / (1 - HOLD_END);
    reach = 1 - easeIn(q);
    amp = 2 + 14 * q;
  }
  const dx = target.x - hand.x;
  const dy = target.y - hand.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const N = SEGMENTS * 3;
  const pts: Pt[] = [];
  for (let k = 0; k <= N; k++) {
    const s = k / N;
    const wave = amp * Math.sin(Math.PI * s) * Math.sin(2 * Math.PI * (1.3 * s - 3 * p));
    pts.push({ x: hand.x + dx * s * reach + nx * wave, y: hand.y + dy * s * reach + ny * wave });
  }
  return pts;
}

const polyline = (pts: Pt[]) => pts.map((q, k) => `${k ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join('');

/**
 * Desenha o chicote nos trechos já montados: contorno claro (pra não sumir na
 * lousa), corpo de couro preto, brilho trançado; na ponta, o fio fino e o
 * pompom desfiado, que balança com o movimento.
 */
function drawLash(el: SVGGElement, pts: Pt[], p: number) {
  const per = (pts.length - 1) / SEGMENTS;
  const paths = el.querySelectorAll<SVGPathElement>('path[data-seg]');
  for (let k = 0; k < SEGMENTS; k++) {
    const d = polyline(pts.slice(Math.round(k * per), Math.round((k + 1) * per) + 1));
    paths[k * 3].setAttribute('d', d);
    paths[k * 3 + 1].setAttribute('d', d);
    paths[k * 3 + 2].setAttribute('d', d);
  }
  // pompom: 4 fiapos saindo da ponta, abrindo na direção do movimento
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 3];
  const ang = Math.atan2(tip.y - prev.y, tip.x - prev.x);
  const flutter = Math.sin(p * 40) * 0.25;
  const cracker = [-0.5, -0.17, 0.17, 0.5].map((spread, k) => {
    const a = ang + spread + flutter * (k % 2 ? 1 : -1);
    const l = 7 + (k % 2) * 3;
    return `M${tip.x.toFixed(1)} ${tip.y.toFixed(1)}l${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}`;
  });
  el.querySelector('path[data-cracker]')?.setAttribute('d', cracker.join(''));
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
  const [shake, setShake] = useState(false);
  const [whip, setWhip] = useState<{ i: number; key: number } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0) || 0);
  const [geo, setGeo] = useState<Record<number, Geo>>({});

  const board = useRef<HTMLDivElement>(null);
  const leftEls = useRef(new Map<number, HTMLButtonElement>());
  const rightEls = useRef(new Map<number, HTMLButtonElement>());
  const lash = useRef<SVGGElement>(null);
  const handEl = useRef<SVGGElement>(null);
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
    const base = aim(g);
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / WHIP_MS);
      // a mão e o cabo giram juntos; o fio sai da ponta do cabo onde ela estiver
      const sw = swingAt(p);
      const deg = base + sw.rot;
      const rad = (deg * Math.PI) / 180;
      const reachOut = (HANDLE + sw.tx) * HAND_SCALE;
      const tip = { x: g.hand.x + Math.cos(rad) * reachOut, y: g.hand.y + Math.sin(rad) * reachOut };
      if (handEl.current) {
        handEl.current.setAttribute('transform',
          `translate(${g.hand.x} ${g.hand.y}) rotate(${deg}) scale(${HAND_SCALE}) translate(${sw.tx} 0)`);
        handEl.current.style.opacity = String(sw.op);
      }
      if (lash.current) {
        drawLash(lash.current, lashPoints(tip, target, p), p);
        lash.current.style.opacity = String(Math.max(sw.op, p < CRACK_AT ? 1 : 0));
      }
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
      primeAudio(); // o som precisa ser liberado dentro do toque
      setWhip({ i: l, key: Date.now() });
      const crack = WHIP_MS * CRACK_AT;
      later(() => { playCrack(); setHit(l); setShake(true); setLinked((k) => [...k, l]); }, crack);
      later(() => setShake(false), crack + 300);
      later(() => speak(round.pairs[l].en), crack + SPEAK_DELAY);
      later(() => setHit((h) => (h === l ? null : h)), crack + 700);
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
      // a da direita só fica verde quando leva a chicotada
      (side === 'l' ? matched.includes(i) : linked.includes(i)) && 'ok', sel && 'sel', bad && 'bad',
      side === 'r' && hit === i && 'hit', side === 'r' && linked.includes(i) && 'hurt',
    ].filter(Boolean).join(' ');
  };
  const wg = whip ? geo[whip.i] : undefined;

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

      <div className={`mt-board ${shake ? 'shake' : ''}`} ref={board}>
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
            style={{
              gridRow: row + 1, gridColumn: 3, '--tilt': tilt(i, 1),
              '--welt': `${-14 + ((i * 53) % 9)}deg`, '--hurt': `${((i * 29) % 2 ? 1 : -1) * 3}deg`,
            } as CSSProperties}
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
              <g ref={lash} className="mt-lash">
                {Array.from({ length: SEGMENTS }, (_, k) => {
                  const w = segWidth(k);
                  const fall = k === SEGMENTS - 1; // último trecho: o fio fino, mais claro
                  return [
                    <path key={`o${k}`} data-seg className="mt-lash-edge" strokeWidth={w + 2.2} />,
                    <path key={`b${k}`} data-seg className={fall ? 'mt-lash-fall' : 'mt-lash-body'} strokeWidth={fall ? 1.2 : w} />,
                    <path key={`s${k}`} data-seg className="mt-lash-braid" strokeWidth={Math.max(0.6, w * 0.38)} opacity={fall ? 0 : 1} />,
                  ];
                })}
                <path data-cracker className="mt-lash-cracker" />
              </g>
              <g ref={handEl} style={{ opacity: 0 }}>
                <g className="mt-hand">
                  {/* alça de pulso e nó na base do cabo */}
                  <path d="M-30 1c-6 3-9 9-5 12s9-2 8-8" className="mt-loop" />
                  <circle cx="-29" cy="0" r="3.6" className="mt-knot" />
                  {/* cabo: afina do punho até a ponta, com o trançado */}
                  <path d="M-27 -3.2 L22 -1.6 L22 1.6 L-27 3.2 Z" className="mt-handle" />
                  <path d="M-24 -2.8l3 5.6M-19 -2.7l3 5.4M-14 -2.5l3 5.1M-9 -2.4l3 4.9M-3 -2.2l3 4.5M3 -2l3 4.1M9 -1.9l3 3.8M15 -1.7l3 3.5" className="mt-braid" />
                  <path d="M20 -2.4v4.8" className="mt-collar" />
                  {/* mão fechada segurando o cabo */}
                  <path d="M-19 -8c-7 0-8 4-8 8s1 8 8 8h9c5 0 6-3 6-6v-4c0-3-1-6-6-6z" className="mt-fist" />
                  <path d="M-15 -7.5v15M-10 -7.5v15M-5 -6.5v13" className="mt-knuckles" />
                </g>
              </g>
              <g transform={`translate(${wg.b.x + 14} ${wg.b.y})`} style={{ '--crack': `${WHIP_MS * CRACK_AT}ms` } as CSSProperties}>
                <circle className="mt-flash" r="16" />
                <g className="mt-crack">
                  {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((a, k) => (
                    <path key={a} d={`M${10 + (k % 2) * 4} 0h${k % 2 ? 14 : 24}`} transform={`rotate(${a})`} />
                  ))}
                </g>
                <text className="mt-bang" x="-4" y="-30">TCHÁ!</text>
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
