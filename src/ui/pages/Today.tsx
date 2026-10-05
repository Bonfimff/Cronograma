import { useData } from '../hooks';
import { useMemo, useSyncExternalStore } from 'react';
import { focoDeEstudo } from '../../core/estudo/foco';
import { ProximosPassos, type Passo } from '../components/Foco';
import { favoritas } from '../../core/library/favoritas';
import { nomes } from '../../core/library/nomes';
import { sheetsOf } from '../../core/library/sheets';
import { content } from '../../core/content/repository';
import { sessionsOn, getWeek } from '../../core/planning/weeks';
import { fmtShort, today, weekdayName, weekStartOf, addDays } from '../../core/dates';
import { reviewBoard } from '../../core/reviews/reviews';
import { refLabel } from '../../core/content/repository';
import { Empty, SessionRow } from '../components/common';
import { Bolt, Camera, Notebook, Plane, Praise, Sparkle, Swash } from '../components/Doodles';
import { Capybara, CrowRaincoat } from '../components/Cutouts';

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
        <p className="eyebrow">{weekdayName(d)} · {fmtShort(d)}</p>
        <h1>{plan?.theme || 'Hoje'}</h1>
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

      <Agora />

      <section>
        <h2 className="head-row">
          <Bolt className="doodle mark" width="20" />
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

      <FolhasMarcadas />

      <section>
        <h2>Próximos dias</h2>
        {upcoming.length ? upcoming.map((s) => <SessionRow key={s.id} s={s} showDate />) : <Empty>Nenhuma sessão nos próximos 7 dias.</Empty>}
      </section>

      <footer className="page-foot">
        <Plane className="doodle mark" width="40" />
        <CrowRaincoat className="cut-foot" width="76" />
      </footer>

    </>
  );
}

/**
 * O que fazer agora, numa linha de cartões: continuar ou começar a aula, revisar as palavras
 * quase esquecidas, treinar a conversa da aula. Vem da mesma memória que os jogos e o chat usam.
 */
function Agora() {
  const data = useData();
  const foco = useMemo(() => focoDeEstudo(data), [data]);
  const a = foco.aula;
  const n = foco.revisar.length;
  const passos: Passo[] = [];
  if (a?.continuar) passos.push({ href: `#/aula/${a.sessao.id}`, titulo: 'Continuar a aula', detalhe: a.sessao.title, icone: 'raio' });
  else if (a?.sessao.status === 'planned') passos.push({ href: `#/sessao/${a.sessao.id}`, titulo: 'Começar a aula', detalhe: a.sessao.title, icone: 'raio' });
  if (n) passos.push({ href: '#/jogos/flashcards?foco=revisar', titulo: `Revisar ${n} ${n === 1 ? 'palavra' : 'palavras'}`, detalhe: 'quase esquecidas · uns 5 minutos', icone: 'flashcards' });
  if (a?.sessao.treino?.length) {
    passos.push({ href: `#/conversa?enviar=${encodeURIComponent('Vamos treinar uma conversa')}`, titulo: 'Treinar a conversa', detalhe: 'perguntas da aula', icone: 'conversa' });
  } else {
    passos.push({ href: '#/conversa', titulo: 'Conversar', detalhe: foco.palavras.length ? `usando ${foco.palavras.slice(0, 3).join(', ')}` : 'com o amigo de treino', icone: 'conversa' });
  }
  if (a?.sessao.status === 'done') passos.push({ href: `#/jogos/fala?foco=aula:${a.sessao.id}`, titulo: 'Falar as palavras', detalhe: `da aula "${a.sessao.title}"`, icone: 'microfone2' });
  return (
    <>
      <ProximosPassos titulo="Agora" passos={passos.slice(0, 4)} />
      {foco.lembradasHoje > 0 && (
        <p className="agora-memoria muted">
          Hoje você deve lembrar cerca de <b>{foco.lembradasHoje}</b> {foco.lembradasHoje === 1 ? 'palavra' : 'palavras'}. <a href="#/progresso">Ver progresso</a>
        </p>
      )}
    </>
  );
}

/** Folhas que o usuário marcou com estrela na Biblioteca. */
function FolhasMarcadas() {
  const data = useData();
  const marcadas = useSyncExternalStore((cb) => favoritas.subscribe(cb), () => favoritas.get());
  if (!marcadas.length) return null;

  const fixas: Record<string, { nome: string; total: number }> = {
    word: { nome: 'Vocabulário', total: content.words.length },
    expression: { nome: 'Expressões', total: content.expressions.length },
    pattern: { nome: 'Padrões', total: content.patterns.length },
    grammar: { nome: 'Gramática', total: content.grammar.length },
  };
  const suas = sheetsOf(data);

  const folhas = marcadas
    .map((k) => {
      const f = fixas[k];
      if (f) return { chave: k, nome: nomes.de(k, f.nome), total: f.total };
      const s = suas.find((x) => x.id === k);
      return s ? { chave: k, nome: nomes.de(k, s.title), total: s.items.length } : null;
    })
    .filter(Boolean) as { chave: string; nome: string; total: number }[];

  if (!folhas.length) return null;
  return (
    <section>
      <h2>Folhas marcadas</h2>
      <p className="chips">
        {folhas.map((f) => (
          <a key={f.chave} className="chip" href={`#/conteudo?folha=${encodeURIComponent(f.chave)}`}>
            {f.nome} <small>{f.total}</small>
          </a>
        ))}
      </p>
    </section>
  );
}
