import { useState } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import { deleteSession, findSession, finishSession, saveUserExercises, startSession, updateSession } from '../../core/sessions/sessions';
import { refLabel, KIND_LABEL as CONTENT_KIND, parseRef } from '../../core/content/repository';
import { fmtShort, weekdayName, weekStartOf } from '../../core/dates';
import { SessionForm } from '../components/SessionForm';
import { FinishForm } from '../components/FinishForm';
import { Empty, Kind, MASTERY_LABEL, UNDERSTOOD_LABEL, USAGE_LABEL } from '../components/common';

export function SessionPage({ id }: { id: string }) {
  const data = useData();
  const s = findSession(data, id);
  const [mode, setMode] = useState<'view' | 'edit' | 'finish'>('view');
  if (!s) return <Empty>Sessão {id} não encontrada.</Empty>;
  const sheet = data.worksheets.find((w) => w.sessionId === s.id);

  if (mode === 'edit')
    return (
      <section>
        <h1>Editar sessão</h1>
        <SessionForm
          initial={s}
          submitLabel="Salvar"
          onCancel={() => setMode('view')}
          onSubmit={(v) => {
            store.update((d) => {
              const { newExercises, ...rest } = v;
              saveUserExercises(d, newExercises ?? []);
              updateSession(d, s.id, { ...rest, weekStart: weekStartOf(v.date) });
            });
            setMode('view');
          }}
        />
      </section>
    );

  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          <span className="mono">{s.id}</span> · {weekdayName(s.date)} {fmtShort(s.date)}
        </p>
        <h1>{s.title}</h1>
        <p className="lead">{s.objective}</p>
        <p><Kind k={s.kind} /></p>
        <div className="actions left">
          {s.status !== 'done' && (
            <button className="primary" onClick={() => { store.update((d) => startSession(d, s.id)); go(`/aula/${s.id}`); }}>
              {s.status === 'in_progress' ? 'Continuar estudo' : 'Iniciar estudo'}
            </button>
          )}
          {s.status === 'done' && <a className="ghost" href={`#/aula/${s.id}`}>Rever aula</a>}
          <a className="ghost" href={`#/imprimir?ids=${s.id}`}>{sheet?.printedAt ? 'Reimprimir folha' : 'Gerar folha'}</a>
          {s.status !== 'planned' && <button className="ghost" onClick={() => setMode('finish')}>{s.status === 'done' ? 'Corrigir resultado' : 'Finalizar'}</button>}
          <button className="ghost" onClick={() => setMode('edit')}>Editar</button>
        </div>
      </section>

      {mode === 'finish' && (
        <section className="inset">
          <h2>Finalizar sessão</h2>
          <FinishForm
            session={s}
            source="manual"
            onSubmit={(r) => { store.update((d) => finishSession(d, s.id, r)); setMode('view'); }}
          />
        </section>
      )}

      {s.result && s.status === 'done' && (
        <section>
          <h2>Resultado</h2>
          <dl className="facts">
            <dt>Status</dt><dd>{MASTERY_LABEL[s.result.mastery]}</dd>
            {s.result.understood && <><dt>Entendi</dt><dd>{UNDERSTOOD_LABEL[s.result.understood]}</dd></>}
            {s.result.usage && <><dt>Utilizou</dt><dd>{USAGE_LABEL[s.result.usage]}</dd></>}
            <dt>Duração</dt><dd>{s.result.durationMin} min</dd>
            <dt>Exercícios</dt><dd>{s.result.exercises.correct} / {s.result.exercises.total}</dd>
            <dt>Registro</dt><dd>{s.result.source === 'scan' ? 'pela folha' : 'manual'} · {s.finishedAt?.slice(0, 10)}</dd>
            {s.result.note && <><dt>Obs.</dt><dd>{s.result.note}</dd></>}
          </dl>
        </section>
      )}

      {s.expected && (
        <section>
          <h2>Resultado esperado</h2>
          <p><strong>{s.expected.result}</strong></p>
          {s.expected.criteria?.length ? <ul>{s.expected.criteria.map((c) => <li key={c}>{c}</li>)}</ul> : null}
        </section>
      )}

      <section>
        <h2>Conteúdos</h2>
        <ul className="plain">
          {s.refs.map((r) => (
            <li key={r}>
              <a href={`#/conteudo/${r}`}>{refLabel(r)}</a> <small>{CONTENT_KIND[parseRef(r).kind]}</small>
              {s.copyRefs.includes(r) && <span className="copy-mark"> ✎ COPIE</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="danger">
        <button className="link" onClick={() => {
          if (confirm(`Excluir a sessão ${s.id}?`)) { store.update((d) => deleteSession(d, s.id)); go('/semana'); }
        }}>Excluir sessão</button>
      </section>
    </>
  );
}
