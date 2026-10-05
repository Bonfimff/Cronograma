import { useMemo, useState } from 'react';
import { focoDeEstudo } from '../../core/estudo/foco';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import type { ContentRef } from '../../core/types';
import { reviewBoard, STATE_LABEL, SUGGESTED_KIND, type ReviewState } from '../../core/reviews/reviews';
import { entriesFor, EVENT_LABEL } from '../../core/history/history';
import { content, copyBlock, refLabel } from '../../core/content/repository';
import { createSession } from '../../core/sessions/sessions';
import { addDays, fmtShort, today } from '../../core/dates';
import { KIND_LABEL } from '../../core/planning/weeks';
import { Empty } from '../components/common';
import { Praise } from '../components/Doodles';
import { CrowBooks, GhostFloat, Trex } from '../components/Cutouts';

const ORDER: ReviewState[] = ['reinforce', 'review', 'not_reviewed', 'scheduled', 'consolidated'];

export function ReviewPage() {
  const data = useData();
  const board = reviewBoard(data);
  // a mesma memória do relatório e dos jogos: o que está escapando, de todas as atividades
  const escapando = useMemo(() => focoDeEstudo(data).revisar, [data]);
  const [sel, setSel] = useState<ContentRef[]>([]);
  const [date, setDate] = useState(addDays(today(), 1));
  const total = ORDER.reduce((n, k) => n + board[k].length, 0);

  const toggle = (r: ContentRef) => setSel((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]));

  const create = () => {
    const states = ORDER.filter((k) => board[k].some((i) => sel.includes(i.ref)));
    const kind = SUGGESTED_KIND[states[0] ?? 'review'];
    let id = '';
    store.update((d) => {
      id = createSession(d, {
        date, kind,
        title: `${KIND_LABEL[kind]}: ${sel.slice(0, 3).map(refLabel).join(', ')}${sel.length > 3 ? '…' : ''}`,
        objective: 'Reutilizar palavras, exemplos e padrões já estudados.',
        refs: sel,
        copyRefs: sel.filter((r) => copyBlock(r)),
      }).id;
    });
    go(`/sessao/${id}`);
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Revisão</p>
        <h1>Revisar, reforçar, consolidar</h1>
        <p className="lead">Selecione conteúdos para montar uma sessão de revisão com os exemplos e exercícios deles.</p>
        <div className="chalk-row">
          <blockquote className="chalk">
            “Repetição<br />é progresso.”
          </blockquote>
          {/* sem nada para revisar o fantasma vagueia pelo meio da tela; com
              conteúdo ele some e o corvo estudioso toma o lugar dele aqui */}
          {total > 0 && <CrowBooks className="cut-aside" width="72" />}
        </div>
      </section>

      {escapando.length > 0 && (
        <section className="paper-card">
          <h2><span className="dot s-reinforce" /> Quase esquecidas <small>{escapando.length}</small></h2>
          <p className="muted">
            Pela sua memória (jogos, aulas, fala, folhas e chat), estas estão com menos de 85% de chance de você lembrar hoje.
            Revisar agora faz a memória durar mais.
          </p>
          <ul className="prog-barras">
            {escapando.map((p) => {
              const w = content.words.find((x) => x.word.toLowerCase() === p.en);
              return (
                <li key={p.en}>
                  {w ? <a className="en" href={`#/conteudo/word:${w.id}`}>{p.en}</a> : <b className="en">{p.en}</b>}
                  <span className="barra"><i style={{ width: `${Math.round(p.retencao * 100)}%` }} /></span>
                  <small>{Math.round(p.retencao * 100)}%</small>
                </li>
              );
            })}
          </ul>
          <div className="actions left">
            <a className="primary" href="#/jogos/flashcards?foco=revisar">Revisar nos Flashcards</a>
            <a className="ghost" href="#/jogos/fala?foco=revisar">Falar no Fala-Rápida</a>
            <a className="ghost" href="#/conversa?foco=revisar">Conversar com elas</a>
          </div>
        </section>
      )}

      {!total && !escapando.length && (
        <>
          <GhostFloat className="ghost-float" width={104} />
          <Empty>O histórico começa quando você finaliza a primeira sessão.</Empty>
        </>
      )}

      {ORDER.map((k) => board[k].length > 0 && (
        <section key={k}>
          <h2><span className={`dot s-${k}`} /> {STATE_LABEL[k]} <small>{board[k].length}</small></h2>
          <ul className="review-list">
            {board[k].map((i) => (
              <li key={i.ref} className={sel.includes(i.ref) ? 'on' : ''}>
                <label className="check">
                  <input type="checkbox" checked={sel.includes(i.ref)} onChange={() => toggle(i.ref)} />
                  <span className="en">{refLabel(i.ref)}</span>
                </label>
                <span className="timeline">
                  {entriesFor(data, i.ref).map((h) => (
                    <span key={h.id} className={`ev e-${h.event}`} title={EVENT_LABEL[h.event]}>{fmtShort(h.date)} {EVENT_LABEL[h.event]}</span>
                  ))}
                </span>
                <small className="muted">próxima: {fmtShort(i.nextDate)}</small>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {sel.length > 0 && (
        <div className="actions sticky">
          <span className="praise-line"><Praise>good job</Praise><Trex className="cut-inline" width="54" /></span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="primary" onClick={create}>Criar sessão ({sel.length})</button>
        </div>
      )}
    </>
  );
}
