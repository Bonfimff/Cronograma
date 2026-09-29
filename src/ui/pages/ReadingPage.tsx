import { useMemo } from 'react';
import { useData } from '../hooks';
import { findSession } from '../../core/sessions/sessions';
import { readingLesson } from '../../core/lessons/reading';
import { speak } from '../../core/lessons/lesson';
import { fmtShort, weekdayName } from '../../core/dates';
import { Empty } from '../components/common';
import { RefCardView } from '../components/RefCardView';

/** Linha em inglês que se pronuncia ao toque, com a tradução embaixo. */
function Line({ en, pt, context }: { en: string; pt: string; context?: string }) {
  return (
    <li className="read-ex">
      <button className="say-line" onClick={() => speak(en)} aria-label={`Ouvir: ${en}`}>
        <span className="en">{en}</span> <span aria-hidden>▶</span>
      </button>
      <span className="pt">{pt}</span>
      {context && <small className="ctx">{context}</small>}
    </li>
  );
}

/**
 * A aula inteira em texto corrido, para ler do começo ao fim: a situação, cada
 * conteúdo explicado com os exemplos, as variações e o fecho com o que treinar.
 * Tudo em inglês é tocável — toca para ouvir. Quem quiser os exercícios usa o
 * estudo guiado, que fica a um toque daqui.
 */
export function ReadingPage({ id }: { id: string }) {
  const data = useData();
  const s = findSession(data, id);
  const lesson = useMemo(() => (s ? readingLesson(s) : null), [s]);
  if (!s || !lesson) return <Empty>Sessão não encontrada.</Empty>;

  return (
    <div className="reading">
      <header className="read-head">
        <a href={`#/sessao/${s.id}`} className="back">‹ voltar à sessão</a>
        <p className="eyebrow"><span className="mono">{s.id}</span> · {weekdayName(s.date)} {fmtShort(s.date)} · {lesson.minutes} min de leitura</p>
        <h1>{lesson.title}</h1>
        <p className="lead">{lesson.objective}</p>
      </header>

      {lesson.parts.map((p) => {
        if (p.type === 'texto') return (
          <section key={p.id} className="read-part">
            <h2>{p.title}</h2>
            {p.lead && <p className="lead">{p.lead}</p>}
            {p.paragraphs.map((t) => <p key={t}>{t}</p>)}
            {p.bullets.length > 0 && <ul>{p.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
          </section>
        );

        if (p.type === 'lista') return (
          <section key={p.id} className="read-part">
            <h2>{p.title}</h2>
            {p.lead && <p className="lead">{p.lead}</p>}
            <ul>{p.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          </section>
        );

        if (p.type === 'copiar') return (
          <section key={p.id} className="read-part">
            <div className="copybox">
              <p className="copy-mark">✎ {p.title}</p>
              {p.lines.map((l) => <p key={l}>{l}</p>)}
            </div>
          </section>
        );

        if (p.type === 'conceito') {
          const e = p.item;
          return (
            <section key={p.id} className="read-part read-concept">
              <p className="concept-kind">{e.kind}</p>
              <h2 className="en">
                <button className="say-line" onClick={() => e.speak && speak(e.speak)} disabled={!e.speak} aria-label={`Ouvir: ${e.title}`}>
                  {e.title} {e.speak && <span aria-hidden>▶</span>}
                </button>
              </h2>
              {e.subtitle && <p className="muted">{e.subtitle}</p>}
              {e.pronunciation && <p className="pron">{e.pronunciation}</p>}
              {e.translations?.length ? <p className="tr">{e.translations.join(' · ')}</p> : null}
              <p>{e.text}</p>
              {e.points?.length ? <ul>{e.points.map((x) => <li key={x}>{x}</li>)}</ul> : null}
              {p.card?.points.length ? (
                <ul className="tight">{p.card.points.map((x) => <li key={x}>{x}</li>)}</ul>
              ) : null}
              {p.examples.length > 0 && (
                <ul className="read-exs">{p.examples.map((x) => <Line key={x.id} en={x.en} pt={x.pt} context={x.context} />)}</ul>
              )}
            </section>
          );
        }

        if (p.type === 'exemplos') return (
          <section key={p.id} className="read-part">
            <h2>{p.title}</h2>
            <ul className="read-exs">{p.examples.map((x) => <Line key={x.id} en={x.en} pt={x.pt} context={x.context} />)}</ul>
          </section>
        );

        return (
          <section key={p.id} className="read-part">
            <p className="concept-kind">como isso varia</p>
            <h2 className="en">{p.item.title}</h2>
            <table className="var">
              <tbody>
                {p.item.rows.map((r) => (
                  <tr key={r.head}>
                    <th className="en">{r.head}</th>
                    <td>
                      <strong>{r.body}</strong>
                      {r.note && <span className="muted">: {r.note}</span>}
                      {r.examples.map((x) => <span key={x.id} className="ex-inline"><span className="en">{x.en}</span> {x.pt}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <section className="read-part">
        <h2>Conteúdos desta aula</h2>
        <p className="muted">Toque para ouvir e ver a tradução.</p>
        <ul className="refcards">
          {s.refs.map((r) => <RefCardView key={r} refId={r} copy={s.copyRefs.includes(r)} />)}
        </ul>
      </section>

      <div className="actions left read-foot">
        <a className="primary" href={`#/aula/${s.id}`}>Fazer o estudo guiado</a>
        <a className="ghost" href={`#/sessao/${s.id}`}>Voltar à sessão</a>
      </div>
    </div>
  );
}
