import { useMemo, useState } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import { addDays, fmtShort, today, weekdayName, weekStartOf } from '../../core/dates';
import { KIND_LABEL } from '../../core/planning/weeks';
import {
  applyPackage, checkPackage, exportPackage, parsePackage, templatePackage, type WeekPackage,
} from '../../core/planning/weekPackage';

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

const CONTENT_LABEL: Record<string, string> = {
  words: 'palavras', expressions: 'expressões', patterns: 'padrões', grammar: 'gramática',
  examples: 'exemplos', topics: 'temas', exercises: 'exercícios',
};

/** Montar a semana a partir de um arquivo JSON (pacote semanal). */
export function BuilderPage({ week: initialWeek }: { week?: string }) {
  const data = useData();
  const [week, setWeek] = useState(weekStartOf(initialWeek ?? today()));
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(true);
  const [done, setDone] = useState<string[] | null>(null);

  const parsed = useMemo(() => (text.trim() ? parsePackage(text) : null), [text]);
  const pkg = parsed && typeof parsed !== 'string' ? (parsed as WeekPackage) : null;
  const check = pkg ? checkPackage(data, pkg, { replacePlanned: replace }) : null;

  const apply = () => {
    if (!pkg || !check?.ok) return;
    let created: string[] = [];
    store.update((d) => { created = applyPackage(d, pkg, { replacePlanned: replace }); });
    setDone(created);
    setText('');
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Montar semana</p>
        <h1>Pacote semanal (JSON)</h1>
        <p className="lead">
          Um arquivo com toda a semana: conteúdo novo, contexto, exemplos, o que vai para a folha, o que fica no app,
          os exercícios e o resultado esperado. Também dá para criar tudo pela plataforma, em <a href={`#/semana/${week}`}>Semana → + sessão</a>.
        </p>
        <div className="actions left">
          <button className="ghost small" onClick={() => download(`modelo-semana-${week}.json`, templatePackage(week))}>Baixar modelo</button>
          <button className="ghost small" onClick={() => download(`semana-${week}.json`, exportPackage(data, week))}>Exportar semana {fmtShort(week)}</button>
          <a className="ghost small" href="#/semana">Ver planejamento</a>
        </div>
        <label className="week-pick">
          Semana para exportar / modelo
          <div className="stepper">
            <button type="button" onClick={() => setWeek(addDays(week, -7))}>‹</button>
            <span>{fmtShort(week)} – {fmtShort(addDays(week, 6))}</span>
            <button type="button" onClick={() => setWeek(addDays(week, 7))}>›</button>
          </div>
        </label>
      </section>

      {done && (
        <section className="brief">
          <p><strong>Semana importada.</strong> {done.length} sessões criadas: <span className="mono">{done.join(', ')}</span></p>
          <div className="actions left">
            <button className="primary small" onClick={() => go(`/semana/${pkg?.week ? weekStartOf(pkg.week) : week}`)}>Abrir semana</button>
            <a className="ghost small" href={`#/imprimir?ids=${done.join(',')}`}>Imprimir folhas</a>
          </div>
        </section>
      )}

      <section className="form">
        <h2>Importar</h2>
        <label className="ghost file">
          Escolher arquivo .json
          <input type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setDone(null); } e.target.value = ''; }} />
        </label>
        <textarea className="json-box" rows={8} value={text} placeholder="…ou cole o JSON aqui" onChange={(e) => { setText(e.target.value); setDone(null); }} spellCheck={false} />

        {typeof parsed === 'string' && <p className="error">{parsed}</p>}

        {check && (
          <>
            {check.errors.length > 0 && (
              <div>
                <h3>Erros ({check.errors.length}) — corrija antes de importar</h3>
                <ul className="check-list err">{check.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
            {check.warnings.length > 0 && (
              <div>
                <h3>Avisos ({check.warnings.length})</h3>
                <ul className="check-list warn">{check.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}

            {pkg && check.summary.week && (
              <div>
                <h3>Pré-visualização · semana {fmtShort(check.summary.week)}</h3>
                <p className="muted">
                  {check.summary.sessions} sessões em {check.summary.days} dias
                  {Object.keys(check.summary.content).length > 0 && <> · conteúdo novo: {Object.entries(check.summary.content).map(([k, n]) => `${n} ${CONTENT_LABEL[k] ?? k}`).join(', ')}</>}
                </p>
                <ul className="plain">
                  {pkg.days?.map((d) => (
                    <li key={d.date}>
                      <strong>{weekdayName(d.date)} {fmtShort(d.date)}</strong>{d.theme && <> · {d.theme}</>}{d.minutes ? <> · {d.minutes} min</> : null}
                      {d.sessions?.map((s, i) => (
                        <div key={i} className="pkg-session">
                          <span className={`kind k-${s.kind}`}>{KIND_LABEL[s.kind] ?? s.kind}</span> {s.title}
                          {s.expected?.result && <div className="muted">→ {s.expected.result}</div>}
                          <div className="muted small-text">
                            {s.refs?.length ?? 0} conteúdos
                            {s.sheet?.copy?.length ? ' · folha: ✎ COPIE' : ''}
                            {s.sheet?.quiz?.length ? ` · ${s.sheet.quiz.length} perguntas` : ''}
                            {s.sheet?.practice ? ' · atividade escrita' : ''}
                            {s.app ? ' · conteúdo do app' : ''}
                            {s.exercises?.length ? ` · ${s.exercises.length} exercícios` : ''}
                          </div>
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="check">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>
                Substituir as sessões ainda não iniciadas desta semana
                {check.summary.replacesIds.length > 0 && <> ({check.summary.replacesIds.length}: {check.summary.replacesIds.join(', ')})</>}
              </span>
            </label>
            <div className="actions">
              <button className="primary" disabled={!check.ok} onClick={apply}>Importar semana</button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
