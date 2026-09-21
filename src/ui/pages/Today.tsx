import { useData } from '../hooks';
import { sessionsOn, getWeek } from '../../core/planning/weeks';
import { fmtShort, today, weekdayName, weekStartOf, addDays } from '../../core/dates';
import { reviewBoard } from '../../core/reviews/reviews';
import { refLabel } from '../../core/content/repository';
import { Empty, SessionRow } from '../components/common';
import { Bolt, Camera, Notebook, Plane, Praise, Sparkle, Swash } from '../components/Doodles';
import { Capybara, CrowRaincoat, Philosopher } from '../components/Cutouts';

/** Frase do dia — a mesma o dia inteiro, muda sozinha a cada data. */
const QUOTES: [string, string][] = [
  ['Small steps build big results.', 'Pequenos passos constroem grandes resultados.'],
  ['Repetition is progress.', 'Repetição é progresso.'],
  ['One word a day changes the year.', 'Uma palavra por dia muda o ano.'],
  ['You learn by using, not by waiting.', 'Você aprende usando, não esperando.'],
  ['Done is better than perfect.', 'Feito é melhor que perfeito.'],
  ['Discipline is also freedom.', 'Disciplina também é liberdade.'],
  ['Keep going, quietly, every day.', 'Siga em frente, no seu ritmo, todo dia.'],
];

function quoteOf(date: string): [string, string] {
  const n = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  return QUOTES[n % QUOTES.length];
}

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
  const doneCount = list.filter((s) => s.status === 'done').length;
  const [en, pt] = quoteOf(d);

  return (
    <>
      <section className="hero">
        <div className="hero-row">
          <div>
            <p className="eyebrow">{weekdayName(d)} · {fmtShort(d)}</p>
            <h1>{plan?.theme || 'Hoje'}</h1>
          </div>
          <Philosopher className="cut-hero" width="104" />
        </div>
        {plan?.objective && <p className="lead">{plan.objective}</p>}
        <blockquote className="chalk">
          “{en}”
          <span className="chalk-sub">{pt}</span>
        </blockquote>
        <Swash className="chalk-swash" />
        <div className="actions left">
          <a className="primary with-icon" href="#/scan?cam=1"><Camera width="19" />Escanear folha</a>
          <a className="ghost" href={`#/semana/${weekStartOf(d)}`}>Planejar semana</a>
        </div>
      </section>

      <section>
        <h2 className="head-row">
          <Bolt className="doodle mark" width="12" />
          Sessões de hoje {list.length > 0 && <small>{doneCount}/{list.length}</small>}
          <Notebook className="doodle head-aside" width="30" />
        </h2>
        {list.length > 0 && (
          <div className="progress" style={{ marginBottom: 12 }}>
            <span style={{ width: `${(doneCount / list.length) * 100}%` }} />
          </div>
        )}
        {list.length ? list.map((s) => <SessionRow key={s.id} s={s} />) : <Empty>Nada planejado para hoje.</Empty>}
        {list.length > 0 && doneCount === list.length && (
          <p className="praise-line"><Praise>tudo feito hoje!</Praise></p>
        )}
        {list.length > 0 && doneCount < list.length && (
          <p className="praise-line">
            <Praise>keep going</Praise>
            <Capybara className="cut-inline" width="64" />
          </p>
        )}
      </section>

      {due.length > 0 && (
        <section>
          <h2 className="head-row">
            <Sparkle className="doodle mark" width="14" />
            Para revisar <a className="more" href="#/revisao">ver tudo</a>
          </h2>
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
        <a className="ghost small" href="#/jogos">Jogar</a>
      </section>

      <footer className="page-foot">
        <span className="foot-line">Inglês no seu ritmo.</span>
        <Plane className="doodle mark" width="40" />
        <CrowRaincoat className="cut-foot" width="76" />
      </footer>
    </>
  );
}
