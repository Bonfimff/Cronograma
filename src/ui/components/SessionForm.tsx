import { useState } from 'react';
import type { ContentRef, Exercise, ExerciseType, ExpectedResult, SessionApp, SessionKind, SessionSheet } from '../../core/types';
import { allRefs, content, copyBlock, getTopic, KIND_LABEL as CONTENT_KIND, parseRef, refLabel } from '../../core/content/repository';
import { KIND_LABEL, KIND_ORDER, weekDates } from '../../core/planning/weeks';
import { fmtShort, today, weekdayName, weekStartOf, addDays } from '../../core/dates';

export interface SessionFormValue {
  date: string;
  kind: SessionKind;
  topicId?: string;
  title: string;
  objective: string;
  refs: ContentRef[];
  copyRefs: ContentRef[];
  whenToUse?: string;
  sheet?: SessionSheet;
  app?: SessionApp;
  expected?: ExpectedResult;
  exerciseIds?: string[];
  /** Exercícios novos escritos neste formulário (viram conteúdo do usuário). */
  newExercises?: Exercise[];
}

const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);
const EX_LABEL: Record<ExerciseType, string> = {
  translate: 'Tradução', fill: 'Completar', choice: 'Escolha', match: 'Associação', build: 'Construção', qa: 'Pergunta e resposta', produce: 'Produção própria',
};

/** Formulário usado no planejamento e no primeiro escaneamento de uma folha. */
export function SessionForm({
  initial, submitLabel, onSubmit, onCancel,
}: {
  initial?: Partial<SessionFormValue>;
  submitLabel: string;
  onSubmit: (v: SessionFormValue) => void;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<SessionFormValue>({
    date: initial?.date ?? today(),
    kind: initial?.kind ?? 'new',
    topicId: initial?.topicId,
    title: initial?.title ?? '',
    objective: initial?.objective ?? '',
    refs: initial?.refs ?? [],
    copyRefs: initial?.copyRefs ?? [],
    whenToUse: initial?.whenToUse ?? '',
    exerciseIds: initial?.exerciseIds ?? [],
    newExercises: [],
  });
  // campos de texto livre (uma linha por item)
  const [txt, setTxt] = useState({
    copy: (initial?.sheet?.copy ?? []).join('\n'),
    quiz: (initial?.sheet?.quiz ?? []).join('\n'),
    practice: initial?.sheet?.practice ?? '',
    intro: initial?.app?.intro ?? '',
    context: initial?.app?.context ?? '',
    tips: (initial?.app?.tips ?? []).join('\n'),
    result: initial?.expected?.result ?? '',
    criteria: (initial?.expected?.criteria ?? []).join('\n'),
  });
  const setT = (p: Partial<typeof txt>) => setTxt((x) => ({ ...x, ...p }));
  const [draftEx, setDraftEx] = useState({ type: 'translate' as ExerciseType, prompt: '', answer: '', options: '' });
  const [week, setWeek] = useState(weekStartOf(v.date));
  const set = (p: Partial<SessionFormValue>) => setV((x) => ({ ...x, ...p }));

  const pickTopic = (id: string) => {
    const t = getTopic(id);
    if (!t) return set({ topicId: undefined });
    set({ topicId: id, title: t.title, objective: t.objective, refs: t.refs, copyRefs: t.refs.filter((r) => copyBlock(r)).slice(0, 1) });
  };

  const toggle = (list: 'refs' | 'copyRefs', r: ContentRef) => {
    const cur = v[list];
    const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r];
    if (list === 'refs' && !next.includes(r)) set({ refs: next, copyRefs: v.copyRefs.filter((x) => x !== r) });
    else set({ [list]: next } as Partial<SessionFormValue>);
  };

  const refs = allRefs();

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.refs.length) return alert('Escolha pelo menos um conteúdo.');
        const sheet: SessionSheet = { copy: lines(txt.copy), quiz: lines(txt.quiz), practice: txt.practice.trim() || undefined };
        const app: SessionApp = { intro: txt.intro.trim() || undefined, context: txt.context.trim() || undefined, tips: lines(txt.tips) };
        const empty = (o: object) => Object.values(o).every((x) => x === undefined || (Array.isArray(x) && !x.length));
        onSubmit({
          ...v,
          title: v.title || 'Sessão',
          sheet: empty(sheet) ? undefined : sheet,
          app: empty(app) ? undefined : app,
          expected: txt.result.trim() ? { result: txt.result.trim(), criteria: lines(txt.criteria) } : undefined,
          exerciseIds: [...(v.exerciseIds ?? []), ...(v.newExercises ?? []).map((x) => x.id)],
        });
      }}
    >
      <div className="grid2">
        <label>
          Semana
          <div className="stepper">
            <button type="button" onClick={() => { const w = addDays(week, -7); setWeek(w); set({ date: w }); }}>‹</button>
            <span>{fmtShort(week)} – {fmtShort(addDays(week, 6))}</span>
            <button type="button" onClick={() => { const w = addDays(week, 7); setWeek(w); set({ date: w }); }}>›</button>
          </div>
        </label>
        <label>
          Dia
          <select value={v.date} onChange={(e) => set({ date: e.target.value })}>
            {weekDates(week).map((d) => <option key={d} value={d}>{weekdayName(d)} {fmtShort(d)}</option>)}
          </select>
        </label>
      </div>

      <label>
        Tipo
        <div className="seg">
          {KIND_ORDER.map((k) => (
            <button type="button" key={k} className={v.kind === k ? 'on' : ''} onClick={() => set({ kind: k })}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </label>

      <label>
        Tema
        <select value={v.topicId ?? ''} onChange={(e) => pickTopic(e.target.value)}>
          <option value="">— livre —</option>
          {content.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>

      <label>
        Título
        <input value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Perguntas básicas" />
      </label>

      <label>
        Objetivo da sessão
        <input value={v.objective} onChange={(e) => set({ objective: e.target.value })} />
      </label>

      <label>
        Quando usar? <small>(resumo da folha — vazio = automático)</small>
        <textarea rows={2} value={v.whenToUse} onChange={(e) => set({ whenToUse: e.target.value })} />
      </label>

      <fieldset>
        <legend>Conteúdos <small>· ✎ = vai para a folha</small></legend>
        <ul className="picklist">
          {refs.map((r) => {
            const on = v.refs.includes(r);
            return (
              <li key={r} className={on ? 'on' : ''}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={() => toggle('refs', r)} />
                  <span>{refLabel(r)}</span>
                  <small>{CONTENT_KIND[parseRef(r).kind]}</small>
                </label>
                {on && copyBlock(r) && (
                  <button
                    type="button"
                    className={`copy-toggle ${v.copyRefs.includes(r) ? 'on' : ''}`}
                    onClick={() => toggle('copyRefs', r)}
                    title="Marcar como ✎ COPIE"
                  >✎</button>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <details className="more-fields" open={!!(initial?.sheet || initial?.expected)}>
        <summary>Folha física</summary>
        <div className="form">
          <label>
            Conceito principal ✎ COPIE <small>(até 3 linhas; vazio = usa os itens marcados com ✎)</small>
            <textarea rows={3} value={txt.copy} onChange={(e) => setT({ copy: e.target.value })} />
          </label>
          <label>
            Tente sem consultar <small>(uma pergunta por linha, até 6; vazio = automático)</small>
            <textarea rows={4} value={txt.quiz} onChange={(e) => setT({ quiz: e.target.value })} />
          </label>
          <label>
            Minha prática — atividade escrita
            <input value={txt.practice} onChange={(e) => setT({ practice: e.target.value })} placeholder="Ex.: Escreva 5 perguntas com How" />
          </label>
        </div>
      </details>

      <details className="more-fields" open={!!initial?.app}>
        <summary>Só no aplicativo</summary>
        <div className="form">
          <label>
            Situação / contexto
            <textarea rows={2} value={txt.context} onChange={(e) => setT({ context: e.target.value })} />
          </label>
          <label>
            Explicação extra
            <textarea rows={2} value={txt.intro} onChange={(e) => setT({ intro: e.target.value })} />
          </label>
          <label>
            Dicas <small>(uma por linha)</small>
            <textarea rows={2} value={txt.tips} onChange={(e) => setT({ tips: e.target.value })} />
          </label>
        </div>
      </details>

      <details className="more-fields" open={!!initial?.expected}>
        <summary>Resultado esperado</summary>
        <div className="form">
          <label>
            Ao final, o aluno deve conseguir…
            <input value={txt.result} onChange={(e) => setT({ result: e.target.value })} />
          </label>
          <label>
            Critérios <small>(um por linha)</small>
            <textarea rows={3} value={txt.criteria} onChange={(e) => setT({ criteria: e.target.value })} />
          </label>
        </div>
      </details>

      <details className="more-fields" open={!!initial?.exerciseIds?.length}>
        <summary>Exercícios <small>({(v.exerciseIds?.length ?? 0) + (v.newExercises?.length ?? 0)} escolhidos; os demais são gerados dos exemplos)</small></summary>
        <ul className="picklist">
          {content.exercises.map((x) => (
            <li key={x.id} className={v.exerciseIds?.includes(x.id) ? 'on' : ''}>
              <label className="check">
                <input type="checkbox" checked={!!v.exerciseIds?.includes(x.id)}
                  onChange={() => set({ exerciseIds: v.exerciseIds?.includes(x.id) ? v.exerciseIds.filter((y) => y !== x.id) : [...(v.exerciseIds ?? []), x.id] })} />
                <span>{x.prompt}</span>
                <small>{EX_LABEL[x.type]}</small>
              </label>
            </li>
          ))}
          {v.newExercises?.map((x, i) => (
            <li key={x.id} className="on">
              <label className="check"><span>{x.prompt}</span><small>{EX_LABEL[x.type]} · novo</small></label>
              <button type="button" className="copy-toggle" onClick={() => set({ newExercises: v.newExercises!.filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
        <div className="form new-ex">
          <div className="grid2">
            <select value={draftEx.type} onChange={(e) => setDraftEx({ ...draftEx, type: e.target.value as ExerciseType })}>
              {(Object.keys(EX_LABEL) as ExerciseType[]).filter((t) => t !== 'match' && t !== 'build').map((t) => <option key={t} value={t}>{EX_LABEL[t]}</option>)}
            </select>
            <input placeholder="Enunciado" value={draftEx.prompt} onChange={(e) => setDraftEx({ ...draftEx, prompt: e.target.value })} />
          </div>
          {draftEx.type !== 'produce' && (
            <div className="grid2">
              <input placeholder="Resposta (várias: separe com |)" value={draftEx.answer} onChange={(e) => setDraftEx({ ...draftEx, answer: e.target.value })} />
              {(draftEx.type === 'choice' || draftEx.type === 'fill') && (
                <input placeholder="Opções separadas por vírgula" value={draftEx.options} onChange={(e) => setDraftEx({ ...draftEx, options: e.target.value })} />
              )}
            </div>
          )}
          <button type="button" className="ghost small" disabled={!draftEx.prompt.trim() || (draftEx.type !== 'produce' && !draftEx.answer.trim())}
            onClick={() => {
              const answers = draftEx.answer.split('|').map((a) => a.trim()).filter(Boolean);
              const options = draftEx.options.split(',').map((o) => o.trim()).filter(Boolean);
              const ex: Exercise = {
                id: `u-${Date.now().toString(36)}`,
                type: draftEx.type,
                prompt: draftEx.prompt.trim(),
                ...(draftEx.type !== 'produce' && { answer: answers.length > 1 ? answers : answers[0] }),
                ...(options.length && { options: options.includes(answers[0]) ? options : [...options, answers[0]] }),
                refs: v.refs,
              };
              set({ newExercises: [...(v.newExercises ?? []), ex] });
              setDraftEx({ type: draftEx.type, prompt: '', answer: '', options: '' });
            }}>+ Adicionar exercício</button>
        </div>
      </details>

      <div className="actions">
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>}
        <button className="primary">{submitLabel}</button>
      </div>
    </form>
  );
}
