import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TRANCO, vibrar } from '../../../core/vibrar';
import { buildVocabPool } from '../../../core/games/wordTetris';
import {
  FAST_RETRIES, FAST_SECONDS, judgeSpeech, newFastRound, wordPoints, type FastWord,
} from '../../../core/games/fastSpeech';
import { ROUND_POINTS } from '../../../core/games/scoring';
import { sheetsOf } from '../../../core/library/sheets';
import { speak } from '../../../core/lessons/lesson';
import { GAME_KEYS } from '../../../core/storage/backup';
import { Mic } from '../../../core/speech/mic';
import { prepare, transcribe } from '../../../core/speech/transcriber';
import { useData } from '../../hooks';
import { Empty } from '../../components/common';
import { GameTabs } from './GameTabs';

const BEST_KEY = GAME_KEYS.fastSpeechBest;
/** Respiro entre a palavra aparecer e o microfone começar a valer (o toque do botão faz barulho). */
const SETTLE_MS = 350;
const NEXT_MS = 1100;

type Phase = 'intro' | 'loading' | 'play' | 'done';
type Stage = 'listening' | 'hearing' | 'judging' | 'ok' | 'bad' | 'unclear' | 'silence';

const STATUS: Record<Stage, string> = {
  listening: '🎤 Ouvindo…',
  hearing: '👂 Ouvi você…',
  judging: '⏳ Avaliando…',
  ok: '',
  bad: '',
  unclear: 'Não entendi bem — tente de novo.',
  silence: 'Não ouvi sua voz.',
};

/**
 * Desafio Fala-Rápida: aparece a palavra em português e a pessoa diz em inglês.
 *
 * O microfone abre uma vez, calibra o ruído do ambiente e só começa a contar o
 * tempo depois que a palavra está na tela. "Não ouvi nada" e "não entendi" não
 * são erro: pedem nova tentativa. Só vale como erro o que foi ouvido e não bate.
 */
export function FastSpeech() {
  const data = useData();
  const pool = useMemo(
    () => [...buildVocabPool(), ...sheetsOf(data).flatMap((s) => s.items)],
    [], // eslint-disable-line react-hooks/exhaustive-deps -- a rodada usa o que havia ao abrir o jogo
  );
  const [words, setWords] = useState<FastWord[]>(() => newFastRound(pool));
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [i, setI] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>('listening');
  const [heard, setHeard] = useState('');
  const [left, setLeft] = useState(FAST_SECONDS);
  const [hits, setHits] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) || 0) || 0);

  const mic = useRef<Mic>(new Mic());
  const cancel = useRef<() => void>(() => {});
  const run = useRef(0);
  const unclearCount = useRef(0);
  const scored = useRef(new Set<number>());
  const level = useRef<HTMLSpanElement>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  useEffect(() => () => {
    run.current++;
    cancel.current();
    timers.current.forEach(window.clearTimeout);
    mic.current.close();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }, []);

  const word = words[i];

  const start = async () => {
    setError('');
    setPhase('loading');
    try {
      setLoadingMsg('Pedindo acesso ao microfone…');
      await mic.current.open(); // dentro do toque, senão o navegador nega
      setLoadingMsg('Baixando o reconhecedor de voz (só na primeira vez)…');
      await prepare(setProgress);
      setLoadingMsg('Fique em silêncio um instante…');
      await mic.current.calibrate();
      setI(0); setHits(0); setScore(0); setAttempt(0);
      scored.current.clear();
      unclearCount.current = 0;
      setPhase('play');
    } catch (e) {
      mic.current.close();
      const name = (e as Error)?.name;
      setError(
        name === 'NotAllowedError' ? 'O microfone foi bloqueado. Permita o acesso nas configurações do navegador e tente de novo.'
          : name === 'NotFoundError' ? 'Nenhum microfone encontrado.'
            : `Não consegui preparar o jogo: ${(e as Error)?.message ?? e}`,
      );
      setPhase('intro');
    }
  };

  const finish = useCallback((points: number) => {
    setPhase('done');
    setBest((b) => {
      if (points <= b) return b;
      try { localStorage.setItem(BEST_KEY, String(points)); } catch { /* sem storage */ }
      return points;
    });
  }, []);

  const next = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    unclearCount.current = 0;
    setHeard('');
    setAttempt(0);
    setI((n) => n + 1);
  }, []);

  // fim da rodada
  useEffect(() => {
    if (phase === 'play' && i >= words.length) finish(score);
  }, [phase, i, words.length, score, finish]);

  // uma escuta por palavra/tentativa
  useEffect(() => {
    if (phase !== 'play' || !word) return;
    const my = ++run.current;
    const alive = () => run.current === my;
    setStage('listening');
    setHeard('');
    setLeft(FAST_SECONDS);

    (async () => {
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      if (!alive()) return;
      const t0 = performance.now();
      let heardVoice = false;
      const tick = window.setInterval(() => {
        if (!heardVoice) setLeft(Math.max(0, Math.ceil(FAST_SECONDS - (performance.now() - t0) / 1000)));
      }, 200);
      const l = mic.current.listen({
        waitMs: FAST_SECONDS * 1000,
        onLevel: (v) => { if (level.current) level.current.style.transform = `scaleX(${v})`; },
        onStart: () => { heardVoice = true; if (alive()) setStage('hearing'); },
      });
      cancel.current = l.cancel;
      const got = await l.result;
      window.clearInterval(tick);
      if (level.current) level.current.style.transform = 'scaleX(0)';
      if (!alive() || got.kind === 'cancelled') return;
      if (got.kind === 'silence') { setLeft(0); setStage('silence'); return; }

      setStage('judging');
      let text = '';
      try { text = await transcribe(got.samples); } catch { if (alive()) setStage('unclear'); return; }
      if (!alive()) return;
      const j = judgeSpeech(word.en, [text]);
      setHeard(j.heard);

      if (j.verdict === 'ok' || j.verdict === 'close') {
        setStage('ok');
        vibrar(TRANCO.carimbo);
        if (!scored.current.has(i)) {
          scored.current.add(i);
          setScore((s) => s + wordPoints(words.length)[i]);
          setHits((h) => h + 1);
        }
        later(() => speak(word.en), 250);
        later(next, NEXT_MS + 600);
      } else if (j.verdict === 'unclear' && unclearCount.current < FAST_RETRIES) {
        unclearCount.current++;
        setStage('unclear');
      } else {
        setStage('bad');
      }
    })();

    return () => { alive() && run.current++; cancel.current(); };
  }, [phase, i, attempt]); // eslint-disable-line react-hooks/exhaustive-deps -- uma escuta por palavra e tentativa

  const retry = () => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    setAttempt((a) => a + 1);
  };
  const again = () => {
    scored.current.clear();
    unclearCount.current = 0;
    setWords(newFastRound(pool));
    setI(0); setHits(0); setScore(0); setAttempt(0); setHeard('');
    setPhase('play');
  };

  if (words.length < 3) return <Empty>Adicione mais palavras em conteúdo para liberar o jogo.</Empty>;

  return (
    <>
      <section className="hero wt-hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Fala-Rápida</p>
        <h1>Desafio Fala-Rápida</h1>
      </section>

      <GameTabs on="fala" />

      {phase === 'intro' && (
        <section className="fs-center">
          <p className="fs-lead">A palavra aparece em português. Diga em inglês, em voz alta.</p>
          <p className="fc-tip">
            Usa o microfone e roda no seu aparelho. Na primeira vez baixa o reconhecedor de voz (cerca de 80 MB); depois fica guardado.
            Pronúncia aproximada vale.
          </p>
          {error && <p className="fs-error" role="alert">{error}</p>}
          <button className="primary big" onClick={start}>🎤 Começar</button>
        </section>
      )}

      {phase === 'loading' && (
        <section className="fs-center" aria-live="polite">
          <p className="fs-lead">{loadingMsg}</p>
          <div className="fs-bar"><span style={{ transform: `scaleX(${progress})` }} /></div>
        </section>
      )}

      {phase === 'play' && word && (
        <>
          <p className="fs-count">Palavra {i + 1} de {words.length} · acertos: {hits} · <b>{score}</b>/{ROUND_POINTS}</p>

          <section className={`fs-card ${stage === 'ok' ? 'good' : stage === 'bad' ? 'miss' : ''}`}>
            <h2 className="fs-word">{word.pt}</h2>
            <p className="fs-sub">fale em inglês</p>
            {stage !== 'listening' && stage !== 'hearing' && stage !== 'judging' && stage !== 'ok' && word.respelling && (
              <p className="fs-sub">como falar: {word.respelling} (aprox.)</p>
            )}
            {stage === 'ok' && <p className="fs-en" lang="en">{word.en}</p>}
          </section>

          <div className="fs-timer" aria-hidden>
            <span style={{ transform: `scaleX(${stage === 'listening' ? left / FAST_SECONDS : stage === 'silence' ? 0 : 1})` }} />
          </div>
          <p className="fs-time">Tempo: {left}s</p>

          <div className="fs-level" aria-hidden><span ref={level} /></div>

          <p className={`fs-status ${stage}`} role="status">
            {stage === 'ok' ? `✓ Você falou: ${heard}` : stage === 'bad' ? `Você falou: ${heard || 'nada reconhecido'}` : STATUS[stage]}
          </p>

          {(stage === 'bad' || stage === 'unclear' || stage === 'silence') && (
            <div className="fs-actions">
              <button className="ghost" onClick={() => speak(word.en)}>🔊 Pronúncia</button>
              <button className="ghost" onClick={retry}>Tentar de novo</button>
              <button className="link" onClick={next}>Pular</button>
            </div>
          )}
          <p className="fc-tip"><a href="#/jogos" onClick={() => { mic.current.close(); }}>Sair</a></p>
        </>
      )}

      {phase === 'done' && (
        <section className="fs-center">
          <p className="fs-lead">Rodada completa!</p>
          <p className="fs-big">{score}<small>/{ROUND_POINTS}</small></p>
          <p className="fc-tip">{hits} de {words.length} palavras · melhor: {best}</p>
          <button className="primary big" onClick={again}>Jogar de novo</button>
        </section>
      )}
    </>
  );
}
