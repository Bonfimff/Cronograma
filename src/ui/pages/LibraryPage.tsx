import { useData } from '../hooks';
import type { ContentRef, Expression, Grammar, Pattern, Word } from '../../core/types';
import { examplesFor, getExamples, KIND_LABEL, parseRef, refLabel, resolve } from '../../core/content/repository';
import { entriesFor, EVENT_LABEL } from '../../core/history/history';
import { reviewStatus, STATE_LABEL } from '../../core/reviews/reviews';
import { speak } from '../../core/lessons/lesson';
import { fmtShort } from '../../core/dates';
import { Empty } from '../components/common';
import { CatMegaphone } from '../components/Cutouts';
import { LibraryIndex } from './LibraryIndex';

export function LibraryPage({ refId }: { refId?: string }) {
  return refId ? <Detail r={refId as ContentRef} /> : <LibraryIndex />;
}

function Detail({ r }: { r: ContentRef }) {
  const data = useData();
  const it = resolve(r);
  if (!it) return <Empty>Conteúdo não encontrado.</Empty>;
  const { kind } = parseRef(r);
  const st = reviewStatus(data, r);
  const hist = entriesFor(data, r);

  return (
    <>
      <section className="hero">
        <a href="#/conteudo" className="back">‹ Biblioteca</a>
        <div className="paper-card tape">
          <p className="eyebrow">{KIND_LABEL[kind]}{st && <> · {STATE_LABEL[st.state]}</>}</p>
          <h1 className="en">{refLabel(r)} {kind !== 'grammar' && <button className="say" onClick={() => speak(refLabel(r).replace(/\+/g, ' '))}>▶</button>}</h1>
          <span className="sticker sticker-go">let's go</span>
          <CatMegaphone className="cut-shout" width="92" />
        </div>
      </section>

      {kind === 'word' && <WordTree w={it as Word} />}
      {kind === 'expression' && (() => {
        const e = it as Expression;
        return (
          <section>
            <dl className="facts">
              <dt>Tradução</dt><dd>{e.translation}</dd>
              <dt>Significado</dt><dd>{e.meaning}</dd>
              <dt>Contexto</dt><dd>{e.context}</dd>
              <dt>Palavras</dt><dd>{e.words.map((w) => <a key={w} href={`#/conteudo/word:${w}`} className="en">{w} </a>)}</dd>
              {e.pattern && <><dt>Estrutura</dt><dd><a href={`#/conteudo/pattern:${e.pattern}`}>{refLabel(`pattern:${e.pattern}`)}</a></dd></>}
            </dl>
          </section>
        );
      })()}
      {kind === 'pattern' && (() => {
        const p = it as Pattern;
        return (
          <section>
            <p>{p.explanation}</p>
            <table className="var"><tbody>
              {p.slots.map((s) => <tr key={s.name}><th>{s.name}</th><td className="en">{s.options.join(' · ')}</td></tr>)}
            </tbody></table>
          </section>
        );
      })()}
      {kind === 'grammar' && (() => {
        const g = it as Grammar;
        return <section><p>{g.explanation}</p><ul>{g.points.map((p) => <li key={p}>{p}</li>)}</ul></section>;
      })()}

      <section>
        <h2>Exemplos</h2>
        <ul className="examples">
          {examplesFor(r).map((x) => (
            <li key={x.id}><p className="en">{x.en} <button className="say" onClick={() => speak(x.en)}>▶</button></p><p className="pt">{x.pt}</p></li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Histórico</h2>
        {hist.length ? (
          <ul className="history">
            {hist.map((h) => <li key={h.id}><span className="mono">{fmtShort(h.date)}</span> — {EVENT_LABEL[h.event]} <a href={`#/sessao/${h.sessionId}`} className="muted mono">{h.sessionId}</a></li>)}
          </ul>
        ) : <Empty>Ainda não estudado.</Empty>}
      </section>
    </>
  );
}

function WordTree({ w }: { w: Word }) {
  return (
    <section className="tree">
      <p className="pron">{w.pronunciation.ipa} {w.pronunciation.respelling && `· ${w.pronunciation.respelling}`} · <em>{w.type}</em></p>
      <p><strong>{w.translations.map((t) => t.text).join(' · ')}</strong></p>
      <p>{w.core_meaning}</p>
      <ul className="branches">
        {w.uses.map((u) => (
          <li key={u.id}>
            <span className="branch">uso: {u.label}</span> — {u.meaning}
            <p className="muted">{u.explanation}</p>
            {getExamples(u.examples).map((x) => <p key={x.id} className="ex-inline"><span className="en">{x.en}</span> {x.pt}</p>)}
          </li>
        ))}
        {w.variations.map((v) => (
          <li key={v.form}>
            <span className="branch en">{v.ref ? <a href={`#/conteudo/${v.ref}`}>{v.form}</a> : v.form}</span> — {v.meaning}
            {v.note && <span className="muted"> ({v.note})</span>}
          </li>
        ))}
      </ul>
      {w.related_words.length > 0 && (
        <p className="muted">Relacionadas: {w.related_words.map((x) => <a key={x} href={`#/conteudo/word:${x}`} className="en">{x} </a>)}</p>
      )}
    </section>
  );
}
