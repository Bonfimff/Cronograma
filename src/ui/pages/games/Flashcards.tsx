import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentRef, Word } from '../../../core/types';
import { content, examplesFor } from '../../../core/content/repository';
import { speak } from '../../../core/lessons/lesson';
import { Empty } from '../../components/common';
import { GameTabs } from './GameTabs';

/** Quanto precisa arrastar pro lado pra valer como resposta. */
const SWIPE_PX = 60;
/** Tempo do carimbo na tela antes de passar pro próximo cartão. */
const STAMP_MS = 900;

type Stamp = 'ok' | 'bad';

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Flashcards no estilo do recorte de papel: a frente mostra a palavra, a
 * pronúncia e o tipo; tocar vira o cartão, que fala a palavra e mostra tradução,
 * exemplos e variações. Arrastar pra direita carimba ACERTEI, pra esquerda ERREI (dos dois
 * lados do cartão) e passa pro próximo. As setas só navegam.
 */
export function Flashcards() {
  const deck = useMemo(() => shuffle(content.words), []);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  const [tally, setTally] = useState({ ok: 0, bad: 0 });
  const startX = useRef<number | null>(null);
  const moved = useRef(false);

  // ao virar o cartão, a palavra é pronunciada junto com a tradução
  useEffect(() => {
    if (open && deck[i]) speak(deck[i].word);
  }, [open, i, deck]);

  if (!deck.length) return <Empty>Adicione palavras em conteúdo para usar os flashcards.</Empty>;

  const w: Word = deck[i];
  const go = (d: number) => { setOpen(false); setI((x) => (x + d + deck.length) % deck.length); };
  const examples = examplesFor(`word:${w.id}` as ContentRef).slice(0, 2);
  const translation = w.translations.map((t) => t.text).join(', ');

  const judge = (s: Stamp) => {
    if (stamp) return; // já tem carimbo descendo
    setDrag(0);
    setStamp(s);
    setTally((t) => ({ ...t, [s]: t[s] + 1 }));
    window.setTimeout(() => { setStamp(null); go(1); }, STAMP_MS);
  };

  return (
    <>
      <section className="hero wt-hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Flashcards</p>
        <h1>Lembra o que significa?</h1>
      </section>

      <GameTabs on="flashcards" />

      <section className="fc-stage">
        <button className="fc-arrow" onClick={() => go(-1)} aria-label="Cartão anterior">‹</button>

        <article
          key={`${w.id}-${open}`}
          className={`paper-card tape fc-card ${stamp ? 'stamped' : ''}`}
          style={drag ? { transform: `translateX(${drag}px) rotate(${drag / 18}deg)`, transition: 'none' } : undefined}
          onPointerDown={(e) => {
            if (stamp) return;
            startX.current = e.clientX;
            moved.current = false;
          }}
          onPointerMove={(e) => {
            if (startX.current === null) return;
            const dx = e.clientX - startX.current;
            if (Math.abs(dx) > 6) {
              if (!moved.current) e.currentTarget.setPointerCapture(e.pointerId);
              moved.current = true;
            }
            if (moved.current) setDrag(dx);
          }}
          onPointerUp={(e) => {
            if (startX.current === null) return;
            const dx = e.clientX - startX.current;
            startX.current = null;
            if (dx > SWIPE_PX) judge('ok');
            else if (dx < -SWIPE_PX) judge('bad');
            else setDrag(0);
          }}
          onPointerCancel={() => {
            // o navegador tomou o gesto (rolagem): se já tinha passado do limite, vale
            startX.current = null;
            if (drag > SWIPE_PX) judge('ok');
            else if (drag < -SWIPE_PX) judge('bad');
            else setDrag(0);
          }}
          onClick={() => {
            if (moved.current) { moved.current = false; return; } // foi arrasto, não toque
            if (!stamp) setOpen((o) => !o);
          }}
        >
          <header className="fc-head">
            <div>
              <h2 className="fc-word">{w.word}</h2>
              <p className="fc-ipa">{w.pronunciation.ipa}</p>
            </div>
            <button
              className="fc-say"
              onClick={(e) => { e.stopPropagation(); speak(w.word); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Ouvir ${w.word}`}
            >
              <svg viewBox="0 0 24 24" width="26" aria-hidden>
                <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
                <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <span className="fc-chip">{w.type}</span>

          {open ? (
            <div className="fc-back">
              <p><b>Tradução:</b> {translation}</p>
              {examples.length > 0 && (
                <>
                  <p className="fc-label">Exemplos:</p>
                  <ul>{examples.map((x) => <li key={x.id}>{x.en}</li>)}</ul>
                </>
              )}
              {w.variations.length > 0 && (
                <>
                  <p className="fc-label">Variações:</p>
                  <ul>{w.variations.slice(0, 2).map((v) => <li key={v.form}>{v.form} <span>({v.meaning})</span></li>)}</ul>
                </>
              )}
            </div>
          ) : (
            <p className="fc-hint">toque para ouvir e ver a tradução</p>
          )}

          {stamp ? (
            <span className={`fc-stamp ${stamp}`} role="status">{stamp === 'ok' ? 'Acertei' : 'Errei'}</span>
          ) : drag !== 0 && (
            // prévia enquanto arrasta: vai aparecendo conforme chega no limite
            <span
              className={`fc-stamp preview ${drag > 0 ? 'ok' : 'bad'}`}
              style={{ opacity: Math.min(1, Math.abs(drag) / SWIPE_PX) * 0.55 }}
              aria-hidden
            >
              {drag > 0 ? 'Acertei' : 'Errei'}
            </span>
          )}

          <span className="sticker fc-go">let's go</span>
        </article>

        <button className="fc-arrow" onClick={() => go(1)} aria-label="Próximo cartão">›</button>
      </section>

      <div className="fc-judge">
        <button className="ghost fc-bad" onClick={() => judge('bad')} disabled={!!stamp}>✗ Errei</button>
        <button className="primary" onClick={() => judge('ok')} disabled={!!stamp}>✓ Acertei</button>
      </div>
      <p className="fc-count">
        {i + 1}/{deck.length} · <span className="fc-okc">✓ {tally.ok}</span> · <span className="fc-badc">✗ {tally.bad}</span>
      </p>
      <p className="fc-tip">arraste o cartão: direita = acertei, esquerda = errei</p>
    </>
  );
}
