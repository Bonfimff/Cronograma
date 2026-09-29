import { useState } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import { getWeek, KIND_LABEL, KIND_ORDER, saveDayPlan, sessionsOn } from '../../core/planning/weeks';
import { addDays, fmtShort, today, weekdayName, weekdayShort, weekStartOf } from '../../core/dates';
import { createSession, saveUserExercises, updateSession } from '../../core/sessions/sessions';
import { SessionForm } from '../components/SessionForm';
import { SessionRow } from '../components/common';
import { CalendarDoodle } from '../components/Doodles';
import { SignpostLive } from '../components/Cutouts';
import { saveUserContent } from '../../core/content/novos';

export function WeekPage({ start }: { start?: string }) {
  const data = useData();
  const ws = weekStartOf(start ?? today());
  const week = getWeek(data, ws);
  const [adding, setAdding] = useState<string | null>(null);
  const weekSessions = data.sessions.filter((s) => s.weekStart === ws);
  const counts = KIND_ORDER.map((k) => [k, weekSessions.filter((s) => s.kind === k).length] as const);
  // a primeira sessão ainda não concluída, de hoje em diante
  const feitas = weekSessions.filter((s) => s.status === 'done').length;
  const proxima = weekSessions
    .filter((s) => s.status !== 'done' && s.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Planejamento semanal</p>
        <div className="week-nav">
          <a href={`#/semana/${addDays(ws, -7)}`}>‹</a>
          <h1>{fmtShort(ws)} – {fmtShort(addDays(ws, 6))}</h1>
          <a href={`#/semana/${addDays(ws, 7)}`}>›</a>
          <CalendarDoodle className="doodle mark week-doodle" width="26" />
        </div>
        {/* a semana como uma trilha que desce ao lado da placa: uma conta por etapa */}
        <div className="semana-topo">
          <ol className="trilha">
            {counts.map(([k, n]) => (
              <li key={k} className={`k-${k} ${n ? 'tem' : ''}`}>
                <span className="trilha-conta">{n}</span>
                <small>{KIND_LABEL[k]}</small>
              </li>
            ))}
          </ol>
          {/* as placas da rua passam a dizer coisas da semana, no lugar das
              frases de trânsito em inglês do recorte original */}
          <SignpostLive className="semana-placa" width={160}>
            <span className="placa placa-datas">
              <span><b>{fmtShort(ws)} a {fmtShort(addDays(ws, 6))}</b></span>
            </span>
            <span className="placa placa-contagem">
              <span>
                <b>{weekSessions.length}</b>
                <small>{weekSessions.length === 1 ? 'sessão' : 'sessões'}</small>
              </span>
            </span>
            <span className="placa placa-feitas">
              <span>
                <small>feitas</small>
                <b>{feitas}</b>
                <small>de {weekSessions.length}</small>
              </span>
            </span>
            <span className="placa placa-proxima">
              <span>
                <small>{proxima ? 'próxima' : 'semana'}</small>
                <b>{proxima ? weekdayShort(proxima.date) : 'livre'}</b>
              </span>
            </span>
          </SignpostLive>
        </div>
        {/* atalhos discretos, depois da frase: são de uso eventual */}
        <p className="atalhos">
          <a href={`#/montar?semana=${ws}`}>Montar semana</a>
          <a href={`#/imprimir?modo=week&semana=${ws}`}>Imprimir plano</a>
        </p>
      </section>

      <nav className="daystrip">
        {week.days.map((day) => (
          <a
            key={day.date}
            href={`#/semana/${ws}`}
            className={day.date === today() ? 'on' : ''}
            onClick={() => document.getElementById(`d-${day.date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <small>{weekdayShort(day.date)}</small>
            <b>{day.date.slice(-2)}</b>
          </a>
        ))}
      </nav>

      {week.days.map((day) => {
        const list = sessionsOn(data, day.date);
        const isToday = day.date === today();
        return (
          <section key={day.date} id={`d-${day.date}`} className={`day ${isToday ? 'is-today' : ''}`}>
            <header className="day-head">
              <h2>{weekdayName(day.date)} <small>{fmtShort(day.date)}</small></h2>
              {isToday && <span className="sticker">foco!</span>}
              <button className="ghost small" onClick={() => setAdding(adding === day.date ? null : day.date)}>+ sessão</button>
            </header>
            <div className="day-plan">
              <input
                placeholder="Tema do dia"
                defaultValue={day.theme}
                key={`t${day.date}${day.theme}`}
                onBlur={(e) => store.update((d) => saveDayPlan(d, day.date, { theme: e.target.value }))}
              />
              <input
                placeholder="Objetivo"
                defaultValue={day.objective}
                key={`o${day.date}${day.objective}`}
                onBlur={(e) => store.update((d) => saveDayPlan(d, day.date, { objective: e.target.value }))}
              />
              <input
                type="number"
                min={0}
                placeholder="min"
                defaultValue={day.minutes ?? ''}
                key={`m${day.date}${day.minutes}`}
                onBlur={(e) => store.update((d) => saveDayPlan(d, day.date, { minutes: Number(e.target.value) || undefined }))}
              />
            </div>
            {list.map((s) => <SessionRow key={s.id} s={s} />)}
            {adding === day.date && (
              <div className="inset">
                <SessionForm
                  initial={{ date: day.date }}
                  submitLabel="Criar sessão"
                  onCancel={() => setAdding(null)}
                  onSubmit={(v) => {
                    let id = '';
                    store.update((d) => {
                      saveUserExercises(d, v.newExercises ?? []);
                      saveUserContent(d, v.newContent ?? {});
                      id = createSession(d, v).id;
                      updateSession(d, id, { sheet: v.sheet, app: v.app, expected: v.expected, exerciseIds: v.exerciseIds });
                    });
                    setAdding(null);
                    go(`/sessao/${id}`);
                  }}
                />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
