import { useState } from 'react';
import type { ContentRef } from '../../core/types';
import { refCard } from '../../core/lessons/reading';
import { speak } from '../../core/lessons/lesson';
import { KIND_LABEL, parseRef, refLabel } from '../../core/content/repository';

/**
 * Um conteúdo da sessão em forma de cartão: tocar pronuncia o inglês e abre a
 * tradução, o significado e alguns exemplos ali mesmo — sem sair da página.
 * Tocar de novo fecha. O link "ver tudo" leva à ficha completa na Biblioteca.
 */
export function RefCardView({ refId, copy }: { refId: ContentRef; copy?: boolean }) {
  const [open, setOpen] = useState(false);
  const card = refCard(refId);

  if (!card) {
    return (
      <li className="refcard missing">
        <span className="refcard-head"><b>{refLabel(refId)}</b> <small>{KIND_LABEL[parseRef(refId).kind]}</small></span>
        <small className="muted">conteúdo não encontrado</small>
      </li>
    );
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && card.speak) speak(card.speak);
  };

  return (
    <li className={`refcard ${open ? 'on' : ''}`}>
      <button className="refcard-head" onClick={toggle} aria-expanded={open}>
        <span className="refcard-title">
          <b className="en">{card.label}</b>
          <small>{card.role ?? card.kind}</small>
        </span>
        <span className="refcard-side">
          {copy && <span className="copy-mark">✎ COPIE</span>}
          {card.speak && <span className="refcard-say" aria-hidden>▶</span>}
        </span>
      </button>

      {open && (
        <div className="refcard-body">
          {card.translations.length > 0 && <p className="tr">{card.translations.join(' · ')}</p>}
          {card.pronunciation && <p className="pron">{card.pronunciation}</p>}
          {card.meaning && <p>{card.meaning}</p>}
          {card.points.length > 0 && <ul className="tight">{card.points.map((p) => <li key={p}>{p}</li>)}</ul>}
          {card.examples.length > 0 && (
            <ul className="refcard-ex">
              {card.examples.map((e) => (
                <li key={e.id}>
                  <button className="say-line" onClick={() => speak(e.en)} aria-label={`Ouvir: ${e.en}`}>
                    <span className="en">{e.en}</span> <span aria-hidden>▶</span>
                  </button>
                  <span className="pt">{e.pt}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="refcard-links">
            {card.speak && <button className="link" onClick={() => speak(card.speak!)}>Ouvir de novo</button>}
            <a className="link" href={`#/conteudo/${card.ref}`}>Ver ficha completa</a>
          </div>
        </div>
      )}
    </li>
  );
}
