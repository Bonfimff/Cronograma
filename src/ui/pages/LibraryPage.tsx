import { useRef, useState } from 'react';
import { useData } from '../hooks';
import { store } from '../../core/storage/store';
import { adicionarExemplo } from '../../core/content/completar';
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
      {/* o verbete é mais uma folha do caderno: mesma margem vermelha, mesma pauta */}
      <section className="hero lib-hero">
        <a href="#/conteudo" className="lib-voltar">‹</a>
        <h1>{KIND_LABEL[kind]}</h1>
        <CatMegaphone className="lib-cut" width="58" />
      </section>

      <article className="lib-sheet verbete">
        <h2 className="lib-title">
          <span className="en">{refLabel(r)}</span>
          {kind !== 'grammar' && (
            <button className="lib-voz" onClick={() => speak(refLabel(r).replace(/\+/g, ' '))} aria-label="Ouvir">🔊</button>
          )}
        </h2>
        {st && <p className="verbete-estado">{STATE_LABEL[st.state]}</p>}

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

        {(() => {
          const exemplos = examplesFor(r);
          return (
            <section>
              {exemplos.length > 0 && (
                <>
                  <h2>Exemplos</h2>
                  <ul className="examples">
                    {exemplos.map((x) => (
                      <li key={x.id}><p className="en">{x.en} <button className="say" onClick={() => speak(x.en)}>▶</button></p><p className="pt">{x.pt}</p></li>
                    ))}
                  </ul>
                </>
              )}
              <NovoExemplo r={r} />
            </section>
          );
        })()}

        {hist.length > 0 && (
          <section className="verbete-historico">
            <h2>Histórico</h2>
            <ul className="history">
              {hist.map((h) => <li key={h.id}><span className="mono">{fmtShort(h.date)}</span>: {EVENT_LABEL[h.event]} <a href={`#/sessao/${h.sessionId}`} className="muted mono">{h.sessionId}</a></li>)}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}

/** Anotar um exemplo no verbete: é assim que uma palavra criada na correria vai ganhando corpo. */
function NovoExemplo({ r }: { r: ContentRef }) {
  const [en, setEn] = useState('');
  const [pt, setPt] = useState('');
  const enRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="lib-form"
      onSubmit={(e) => {
        e.preventDefault();
        let ok = false;
        store.update((d) => { ok = adicionarExemplo(d, r, en, pt); });
        if (ok) { setEn(''); setPt(''); enRef.current?.focus(); }
      }}
    >
      <input ref={enRef} value={en} onChange={(e) => setEn(e.target.value)} placeholder="Exemplo em inglês" lang="en" />
      <input value={pt} onChange={(e) => setPt(e.target.value)} placeholder="Tradução" />
      <button className="primary" disabled={!en.trim()}>Anotar exemplo</button>
    </form>
  );
}

function WordTree({ w }: { w: Word }) {
  return (
    <section className="tree">
      {(w.pronunciation.ipa || w.pronunciation.respelling || w.type) && (
        <p className="pron">
          {w.pronunciation.ipa} {w.pronunciation.respelling && `· ${w.pronunciation.respelling}`}
          {(w.pronunciation.ipa || w.pronunciation.respelling) && w.type ? ' · ' : ''}
          <em>{w.type}</em>
        </p>
      )}
      <p><strong>{w.translations.map((t) => t.text).join(' · ')}</strong></p>
      {w.core_meaning && w.core_meaning !== w.translations.map((t) => t.text).join(' · ') && <p>{w.core_meaning}</p>}
      {(w.uses.length > 0 || w.variations.length > 0) && (
      <ul className="branches">
        {w.uses.map((u) => (
          <li key={u.id}>
            <span className="branch">uso: {u.label}</span> {u.meaning}
            <p className="muted">{u.explanation}</p>
            {getExamples(u.examples).map((x) => <p key={x.id} className="ex-inline"><span className="en">{x.en}</span> {x.pt}</p>)}
          </li>
        ))}
        {w.variations.map((v) => (
          <li key={v.form}>
            <span className="branch en">{v.ref ? <a href={`#/conteudo/${v.ref}`}>{v.form}</a> : v.form}</span> {v.meaning}
            {v.note && <span className="muted"> ({v.note})</span>}
          </li>
        ))}
      </ul>
      )}
      {w.related_words.length > 0 && (
        <p className="muted">Relacionadas: {w.related_words.map((x) => <a key={x} href={`#/conteudo/word:${x}`} className="en">{x} </a>)}</p>
      )}
    </section>
  );
}
