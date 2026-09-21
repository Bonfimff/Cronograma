import { useMemo, useRef, useState } from 'react';
import type { ContentRef, Word } from '../../../core/types';
import { content, examplesFor } from '../../../core/content/repository';
import { speak } from '../../../core/lessons/lesson';
import { Empty } from '../../components/common';
import { GameTabs } from './GameTabs';

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
 * pronúncia e o tipo; tocar vira o cartão e mostra tradução, exemplos e
 * variações. Setas (ou arrastar pro lado) passam de cartão.
 */
export function Flashcards() {
  const deck = useMemo(() => shuffle(content.words), []);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const touchX = useRef<number | null>(null);

  if (!deck.length) return <Empty>Adicione palavras em conteúdo para usar os flashcards.</Empty>;

  const w: Word = deck[i];
  const go = (d: number) => { setOpen(false); setI((x) => (x + d + deck.length) % deck.length); };
  const examples = examplesFor(`word:${w.id}` as ContentRef).slice(0, 2);
  const translation = w.translations.map((t) => t.text).join(', ');

  return (
    <>
      <section className="hero wt-hero">
        <p className="eyebrow"><a href="#/jogos">Jogos</a> · Flashcards</p>
        <h1>Lembra o que significa?</h1>
      </section>

      <GameTabs on="flashcards" />

      <section
        className="fc-stage"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <button className="fc-arrow" onClick={() => go(-1)} aria-label="Cartão anterior">‹</button>

        <article
          key={`${w.id}-${open}`}
          className={`paper-card tape fc-card ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          <header className="fc-head">
            <div>
              <h2 className="fc-word">{w.word}</h2>
              <p className="fc-ipa">{w.pronunciation.ipa}</p>
            </div>
            <button
              className="fc-say"
              onClick={(e) => { e.stopPropagation(); speak(w.word); }}
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
            <p className="fc-hint">toque para ver a tradução</p>
          )}

          <span className="sticker fc-go">let's go</span>
        </article>

        <button className="fc-arrow" onClick={() => go(1)} aria-label="Próximo cartão">›</button>
      </section>

      <p className="fc-count">{i + 1}/{deck.length}</p>
    </>
  );
}
