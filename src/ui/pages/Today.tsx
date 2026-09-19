import { useData } from '../hooks';
import { sessionsOn, getWeek } from '../../core/planning/weeks';
import { fmtShort, today, weekdayName, weekStartOf, addDays } from '../../core/dates';
import { reviewBoard } from '../../core/reviews/reviews';
import { refLabel } from '../../core/content/repository';
import { Empty, SessionRow } from '../components/common';

export function Today() {
  const data = useData();
  const d = today();
  const plan = getWeek(data, weekStartOf(d)).days.find((x) => x.date === d);
  const list = sessionsOn(data, d);
  const upcoming = data.sessions
    .filter((s) => s.date > d && s.date <= addDays(d, 6) && s.status !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date));
  const board = reviewBoard(data);
  const due = [...board.reinforce, ...board.review, ...board.not_reviewed];

  return (
    <>
      <section className="hero">
        <p className="eyebrow">{weekdayName(d)} · {fmtShort(d)}</p>
        <h1>{plan?.theme || 'Hoje'}</h1>
        {plan?.objective && <p className="lead">{plan.objective}</p>}
        <div className="actions left">
          <a className="primary" href="#/scan">Escanear folha</a>
          <a className="ghost" href={`#/semana/${weekStartOf(d)}`}>Planejar semana</a>
        </div>
      </section>

      <section>
        <h2>Sessões de hoje</h2>
        {list.length ? list.map((s) => <SessionRow key={s.id} s={s} />) : <Empty>Nada planejado para hoje.</Empty>}
      </section>

      {due.length > 0 && (
        <section>
          <h2>Para revisar <a className="more" href="#/revisao">ver tudo</a></h2>
          <p className="chips">
            {due.slice(0, 12).map((i) => (
              <a key={i.ref} href={`#/conteudo/${i.ref}`} className={`chip s-${i.state}`}>{refLabel(i.ref)}</a>
            ))}
          </p>
        </section>
      )}

      <section>
        <h2>Próximos dias</h2>
        {upcoming.length ? upcoming.map((s) => <SessionRow key={s.id} s={s} showDate />) : <Empty>Nenhuma sessão nos próximos 7 dias.</Empty>}
      </section>

      <section className="actions left">
        <a className="ghost small" href="#/imprimir">Imprimir folhas</a>
        <a className="ghost small" href="#/dados">Backup dos dados</a>
      </section>
    </>
  );
}
