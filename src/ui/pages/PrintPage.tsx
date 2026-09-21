import { useState } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import type { Session } from '../../core/types';
import { createBlankSheets, ensureSheetForSession, markPrinted } from '../../core/worksheets/worksheets';
import { PAGES, STUDY_PAGES } from '../../core/worksheets/templates';
import { copyLines, studySheetValues, weekSheetValues } from '../../core/worksheets/fill';
import { addDays, fmtShort, today, weekStartOf } from '../../core/dates';
import { SheetSvg } from '../components/SheetSvg';

type Mode = 'study' | 'week' | 'guide';

export function PrintPage({ ids, mode: initialMode, week: initialWeek }: { ids: string[]; mode?: Mode; week?: string }) {
  const data = useData();
  const [mode, setMode] = useState<Mode>(initialMode ?? 'study');
  const [selected, setSelected] = useState<string[]>(ids);
  const [blank, setBlank] = useState(0);
  const [week, setWeek] = useState(weekStartOf(initialWeek ?? today()));
  const [backs, setBacks] = useState(true);

  const candidates = data.sessions.filter((s) => s.status !== 'done' || ids.includes(s.id)).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = selected.map((id) => data.sessions.find((s) => s.id === id)).filter(Boolean) as Session[];
  const blanks = data.worksheets.filter((w) => !w.sessionId && !w.printedAt);
  const tooLong = sessions.filter((s) => copyLines(s).length > 3);
  const pages = STUDY_PAGES.filter((p) => backs || p === 'study-front');

  const print = () => {
    if (mode === 'study')
      store.update((d) => {
        sessions.forEach((s) => ensureSheetForSession(d, s));
        markPrinted(d, [...sessions.map((s) => s.id), ...blanks.map((b) => b.id)]);
      });
    setTimeout(() => window.print(), 50);
  };

  const count = mode === 'study' ? (sessions.length + blanks.length) * pages.length : 1;

  return (
    <div className="print-page">
      <aside className="print-controls no-print">
        <a href="#/" className="back">‹ voltar</a>
        <h1>Imprimir</h1>
        <div className="seg">
          <button className={mode === 'study' ? 'on' : ''} onClick={() => setMode('study')}>Dia de Estudo</button>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>Plano semanal</button>
          <button className={mode === 'guide' ? 'on' : ''} onClick={() => setMode('guide')}>Orientações</button>
        </div>

        {mode === 'study' && (
          <>
            <fieldset>
              <legend>Sessões</legend>
              <ul className="picklist">
                {candidates.map((s) => (
                  <li key={s.id} className={selected.includes(s.id) ? 'on' : ''}>
                    <label className="check">
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => setSelected((x) => x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id])} />
                      <span>{fmtShort(s.date)} · {s.title}</span>
                      <small className="mono">{s.id}</small>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <fieldset>
              <legend>Folhas em branco</legend>
              <p className="muted">Códigos reservados. A sessão é escolhida no primeiro escaneamento.</p>
              <div className="inline-answer">
                <input type="number" min={1} max={30} value={blank || ''} placeholder="quantidade" onChange={(e) => setBlank(Number(e.target.value))} />
                <button className="ghost small" disabled={!blank} onClick={() => { store.update((d) => createBlankSheets(d, blank)); setBlank(0); }}>Gerar</button>
              </div>
              {blanks.length > 0 && <p className="muted">{blanks.length} em branco na fila de impressão.</p>}
            </fieldset>
            <label className="check">
              <input type="checkbox" checked={backs} onChange={(e) => setBacks(e.target.checked)} />
              <span>Incluir verso (frente e verso)</span>
            </label>
            {tooLong.length > 0 && (
              <p className="warn">
                O Conceito principal tem 3 linhas. Em {tooLong.map((s) => s.id).join(', ')} há mais conteúdo ✎ COPIE do que cabe; só as 3 primeiras linhas saem na folha.
              </p>
            )}
          </>
        )}

        {mode === 'week' && (
          <label>
            Semana
            <div className="stepper">
              <button type="button" onClick={() => setWeek(addDays(week, -7))}>‹</button>
              <span>{fmtShort(week)} – {fmtShort(addDays(week, 6))}</span>
              <button type="button" onClick={() => setWeek(addDays(week, 7))}>›</button>
            </div>
          </label>
        )}

        <div className="actions">
          <button className="ghost" onClick={() => go('/')}>Cancelar</button>
          <button className="primary" disabled={!count} onClick={print}>Imprimir {count} {count === 1 ? 'página' : 'páginas'}</button>
        </div>
      </aside>

      <div className="sheets">
        {mode === 'study' && (
          <>
            {sessions.map((s) => pages.map((p) => <SheetSvg key={s.id + p} page={PAGES[p]} code={s.id} values={studySheetValues(s, s.id)} />))}
            {blanks.map((b) => pages.map((p) => <SheetSvg key={b.id + p} page={PAGES[p]} code={b.id} values={studySheetValues(undefined, b.id)} />))}
            {!count && <p className="empty no-print">Selecione sessões ou gere folhas em branco.</p>}
          </>
        )}
        {mode === 'week' && <SheetSvg page={PAGES['week-plan']} values={weekSheetValues(data, week)} />}
        {mode === 'guide' && <SheetSvg page={PAGES.guide} values={{}} />}
      </div>
    </div>
  );
}
