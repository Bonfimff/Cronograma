import { IconeKit } from '../components/Doodles';
import { createContext, useContext, useRef, useState } from 'react';
import { useData } from '../hooks';
import { store } from '../../core/storage/store';
import {
  adicionarExemplo, adicionarExemploNoUso, adicionarUso, atualizarItem, atualizarUso, removerUso,
} from '../../core/content/completar';
import type { ContentRef, Expression, Grammar, Pattern, Word, WordUse } from '../../core/types';
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

/** Modo de edição do verbete: ligado no lápis, ao lado do alto-falante. */
const Edicao = createContext(false);
const usandoLapis = () => useContext(Edicao);

function Detail({ r }: { r: ContentRef }) {
  const data = useData();
  const it = resolve(r);
  if (!it) return <Empty>Conteúdo não encontrado.</Empty>;
  const { kind } = parseRef(r);
  const st = reviewStatus(data, r);
  const hist = entriesFor(data, r);
  const [editando, setEditando] = useState(false);

  return (
    <Edicao.Provider value={editando}>
      {/* o verbete é mais uma folha do caderno: mesma margem vermelha, mesma pauta */}
      <section className="hero lib-hero">
        <a href="#/conteudo" className="lib-voltar">‹</a>
        <h1>{KIND_LABEL[kind]}</h1>
        <CatMegaphone className="lib-cut" width="58" />
      </section>

      <article className="lib-sheet verbete">
        <h2 className="lib-title">
          <span className="en">{refLabel(r)}</span>
          {/* o lápis acende os campos: fora dele o verbete fica só de leitura */}
          <button
            className={`lib-voz ${editando ? 'on' : ''}`}
            onClick={() => setEditando((x) => !x)}
            aria-pressed={editando}
            aria-label={editando ? 'Terminar a edição' : 'Editar este verbete'}
            title={editando ? 'Terminar a edição' : 'Editar este verbete'}
          >
            <IconeKit nome="lapis" width={22} />

          </button>
          {kind !== 'grammar' && (
            <button className="lib-voz" onClick={() => speak(refLabel(r).replace(/\+/g, ' '))} aria-label="Ouvir"><IconeKit nome="ouvir" width={24} /></button>
          )}

        </h2>
        {st && <p className="verbete-estado">{STATE_LABEL[st.state]}</p>}

      {kind === 'word' && <WordTree w={it as Word} r={r} />}
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
    </Edicao.Provider>
  );
}

/**
 * Campo do verbete que fica à espera: vazio, mostra o nome do que falta e um
 * tracejado; tocado, vira um campo de escrita. Enter ou sair do campo guarda.
 */
function Campo({
  r, nome, valor, campo, textoLongo, converter,
}: {
  r: ContentRef;
  nome: string;
  valor: string;
  campo: string;
  textoLongo?: boolean;
  converter?: (v: string) => unknown;
}) {
  const lapis = usandoLapis();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);

  const guardar = () => {
    setEditando(false);
    if (texto.trim() === valor.trim()) return;
    store.update((d) => { atualizarItem(d, r, { [campo]: converter ? converter(texto) : texto.trim() }); });
  };

  if (!lapis) return valor.trim() ? <span>{valor}</span> : null;

  if (editando) {
    const comum = {
      value: texto,
      autoFocus: true,
      onBlur: guardar,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTexto(e.target.value),
      placeholder: nome,
      'aria-label': nome,
    };
    return textoLongo
      ? <textarea className="campo-verbete" rows={3} {...comum} />
      : (
        <input
          className="campo-verbete"
          {...comum}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); guardar(); }
            if (e.key === 'Escape') { setTexto(valor); setEditando(false); }
          }}
        />
      );
  }

  return (
    <button className={`campo-valor ${valor.trim() ? '' : 'vazio'}`} onClick={() => { setTexto(valor); setEditando(true); }}>
      {valor.trim() || `anotar ${nome.toLowerCase()}`}
    </button>
  );
}

/** Um uso da palavra, com os campos abertos para escrita e exemplos próprios. */
function Uso({ r, u }: { r: ContentRef; u: WordUse }) {
  const lapis = usandoLapis();
  const [novo, setNovo] = useState(false);
  const [en, setEn] = useState('');
  const [pt, setPt] = useState('');

  const campo = (nome: string, chave: 'label' | 'meaning' | 'explanation', valor: string, longo?: boolean) => (
    <CampoUso r={r} usoId={u.id} nome={nome} campo={chave} valor={valor} textoLongo={longo} />
  );

  return (
    <li>
      <span className="branch">uso: {campo('nome do uso', 'label', u.label)}</span>{' '}
      {campo('em português', 'meaning', u.meaning)}
      <p className="muted">{campo('explicação', 'explanation', u.explanation, true)}</p>
      {getExamples(u.examples).map((x) => (
        <p key={x.id} className="ex-inline">
          <span className="en">{x.en}</span> {x.pt}
          <button className="say" onClick={() => speak(x.en)}>▶</button>
        </p>
      ))}
      {lapis && novo ? (
        <form
          className="lib-form"
          onSubmit={(e) => {
            e.preventDefault();
            let ok = false;
            store.update((d) => { ok = adicionarExemploNoUso(d, r, u.id, en, pt); });
            if (ok) { setEn(''); setPt(''); setNovo(false); }
          }}
        >
          <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="Exemplo em inglês" lang="en" autoFocus />
          <input value={pt} onChange={(e) => setPt(e.target.value)} placeholder="Tradução" />
          <button className="primary" disabled={!en.trim()}><IconeKit nome="adicionar" width={18} />Anotar</button>
          <button type="button" className="link" onClick={() => setNovo(false)}>cancelar</button>
        </form>
      ) : lapis ? (
        <p className="uso-acoes">
          <button className="link" onClick={() => setNovo(true)}>+ exemplo neste uso</button>
          <button
            className="link lib-del"
            onClick={() => { if (window.confirm(`Tirar o uso "${u.label}"?`)) store.update((d) => removerUso(d, r, u.id)); }}
          >tirar uso</button>
        </p>
      ) : null}
    </li>
  );
}

/** Campo editável dentro de um uso. */
function CampoUso({
  r, usoId, nome, campo, valor, textoLongo,
}: { r: ContentRef; usoId: string; nome: string; campo: string; valor: string; textoLongo?: boolean }) {
  const lapis = usandoLapis();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const guardar = () => {
    setEditando(false);
    if (texto.trim() === valor.trim()) return;
    store.update((d) => { atualizarUso(d, r, usoId, { [campo]: texto.trim() }); });
  };
  if (!lapis) return valor.trim() ? <>{valor}</> : null;
  if (editando) {
    const comum = {
      value: texto,
      autoFocus: true,
      onBlur: guardar,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTexto(e.target.value),
      placeholder: nome,
      'aria-label': nome,
    };
    return textoLongo
      ? <textarea className="campo-verbete" rows={2} {...comum} />
      : (
        <input
          className="campo-verbete campo-curto"
          {...comum}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); guardar(); }
            if (e.key === 'Escape') { setTexto(valor); setEditando(false); }
          }}
        />
      );
  }
  return (
    <button className={`campo-valor solto ${valor.trim() ? '' : 'vazio'}`} onClick={() => { setTexto(valor); setEditando(true); }}>
      {valor.trim() || `anotar ${nome}`}
    </button>
  );
}

/** Anotar um uso novo da palavra. */
function NovoUso({ r }: { r: ContentRef }) {
  const lapis = usandoLapis();
  const [aberto, setAberto] = useState(false);
  const [label, setLabel] = useState('');
  const [meaning, setMeaning] = useState('');
  const [explanation, setExplanation] = useState('');

  if (!lapis) return null;
  if (!aberto) return <button className="link campo-mais" onClick={() => setAberto(true)}>+ anotar um uso</button>;
  return (
    <form
      className="lib-form"
      onSubmit={(e) => {
        e.preventDefault();
        let ok = false;
        store.update((d) => { ok = adicionarUso(d, r, label, meaning, explanation); });
        if (ok) { setLabel(''); setMeaning(''); setExplanation(''); setAberto(false); }
      }}
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome do uso (ex.: estado)" autoFocus />
      <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="Em português (ex.: como está)" />
      <input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Explicação curta" />
      <button className="primary" disabled={!label.trim()}><IconeKit nome="adicionar" width={18} />Anotar uso</button>
      <button type="button" className="link" onClick={() => setAberto(false)}>cancelar</button>
    </form>
  );
}

/** Anotar um exemplo no verbete: é assim que uma palavra criada na correria vai ganhando corpo. */
function NovoExemplo({ r }: { r: ContentRef }) {
  const lapis = usandoLapis();
  const [en, setEn] = useState('');
  const [pt, setPt] = useState('');
  const enRef = useRef<HTMLInputElement>(null);
  if (!lapis) return null;
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
      <button className="primary" disabled={!en.trim()}><IconeKit nome="adicionar" width={18} />Anotar exemplo</button>
    </form>
  );
}

function WordTree({ w, r }: { w: Word; r: ContentRef }) {
  const lapis = usandoLapis();
  const traducoes = w.translations.map((t) => t.text).join(', ');
  return (
    <section className="tree">
      {/* os campos ficam à vista mesmo vazios: é só tocar e escrever */}
      <dl className="campos">
        {[
          { rotulo: 'Tipo', valor: w.type, campo: <Campo r={r} nome="Tipo" campo="type" valor={w.type} /> },
          {
            rotulo: 'Pronúncia',
            valor: w.pronunciation.ipa,
            campo: (
              <Campo
                r={r} nome="Pronúncia (IPA)" campo="pronunciation" valor={w.pronunciation.ipa}
                converter={(v) => ({ ...w.pronunciation, ipa: v.trim() })}
              />
            ),
          },
          {
            rotulo: 'Como soa',
            valor: w.pronunciation.respelling ?? '',
            campo: (
              <Campo
                r={r} nome="Como soa em português" campo="pronunciation" valor={w.pronunciation.respelling ?? ''}
                converter={(v) => ({ ...w.pronunciation, respelling: v.trim() })}
              />
            ),
          },
          {
            rotulo: 'Tradução',
            valor: traducoes,
            campo: (
              <Campo
                r={r} nome="Tradução" campo="translations" valor={traducoes}
                converter={(v) => v.split(',').map((x) => ({ text: x.trim() })).filter((x) => x.text)}
              />
            ),
          },
          {
            rotulo: 'Significado',
            valor: w.core_meaning,
            campo: <Campo r={r} nome="Significado" campo="core_meaning" valor={w.core_meaning} textoLongo />,
          },
        ]
          // sem o lápis, linha vazia não aparece: o verbete fica limpo
          .filter((linha) => lapis || linha.valor.trim())
          .map((linha) => (
            <div key={linha.rotulo} className="campo-linha">
              <dt>{linha.rotulo}</dt>
              <dd>{linha.campo}</dd>
            </div>
          ))}
      </dl>

      <ul className="branches">
        {w.uses.map((u) => <Uso key={u.id} r={r} u={u} />)}
        {w.variations.map((v) => (
          <li key={v.form}>
            <span className="branch en">{v.ref ? <a href={`#/conteudo/${v.ref}`}>{v.form}</a> : v.form}</span> {v.meaning}
            {v.note && <span className="muted"> ({v.note})</span>}
          </li>
        ))}
      </ul>
      <NovoUso r={r} />

      {w.related_words.length > 0 && (
        <p className="muted">Relacionadas: {w.related_words.map((x) => <a key={x} href={`#/conteudo/word:${x}`} className="en">{x} </a>)}</p>
      )}
    </section>
  );
}
