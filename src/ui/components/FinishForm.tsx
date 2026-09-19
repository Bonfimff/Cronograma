import { useState } from 'react';
import type { MasteryStatus, Session, SessionResult, UnderstoodStatus, UsageStatus } from '../../core/types';
import { elapsedMinutes } from '../../core/sessions/sessions';
import { MASTERY_LABEL, UNDERSTOOD_LABEL, USAGE_LABEL } from './common';

/** Registro final da sessão. Os valores podem vir pré-preenchidos pela leitura da folha. */
export function FinishForm({
  session, preset, source, onSubmit,
}: {
  session: Session;
  preset?: { mastery?: MasteryStatus | null; usage?: UsageStatus | null; understood?: UnderstoodStatus | null };
  source: SessionResult['source'];
  onSubmit: (r: SessionResult) => void;
}) {
  const [mastery, setMastery] = useState<MasteryStatus | null>(preset?.mastery ?? session.result?.mastery ?? null);
  const [usage, setUsage] = useState<UsageStatus | null>(preset?.usage ?? session.result?.usage ?? null);
  const [understood, setUnderstood] = useState<UnderstoodStatus | null>(preset?.understood ?? session.result?.understood ?? null);
  const [minutes, setMinutes] = useState(session.result?.durationMin || elapsedMinutes(session) || 30);
  const [note, setNote] = useState(session.result?.note ?? '');
  const ex = session.result?.exercises ?? { total: 0, correct: 0 };

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mastery) return alert('Marque o status do conteúdo.');
        onSubmit({ durationMin: minutes, exercises: ex, mastery, usage: usage ?? undefined, understood: understood ?? undefined, note: note.trim() || undefined, source });
      }}
    >
      <fieldset>
        <legend>Status do conteúdo</legend>
        <div className="boxes">
          {(Object.keys(MASTERY_LABEL) as MasteryStatus[]).map((k) => (
            <label key={k} className={`box ${mastery === k ? 'on' : ''}`}>
              <input type="radio" name="m" checked={mastery === k} onChange={() => setMastery(k)} />
              <span className="sq" />{MASTERY_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Entendi?</legend>
        <div className="boxes inline">
          {(Object.keys(UNDERSTOOD_LABEL) as UnderstoodStatus[]).map((k) => (
            <label key={k} className={`box ${understood === k ? 'on' : ''}`}>
              <input type="radio" name="e" checked={understood === k} onChange={() => setUnderstood(k)} />
              <span className="sq" />{UNDERSTOOD_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Consegui utilizar?</legend>
        <div className="boxes inline">
          {(Object.keys(USAGE_LABEL) as UsageStatus[]).map((k) => (
            <label key={k} className={`box ${usage === k ? 'on' : ''}`}>
              <input type="radio" name="u" checked={usage === k} onChange={() => setUsage(k)} />
              <span className="sq" />{USAGE_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid2">
        <label>
          Duração (min)
          <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
        </label>
        <label>
          Exercícios na aula
          <input readOnly value={ex.total ? `${ex.correct} / ${ex.total} corretos` : 'nenhum registrado'} />
        </label>
      </div>
      <label>
        Observação
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="actions">
        <button className="primary">Registrar resultado</button>
      </div>
    </form>
  );
}
