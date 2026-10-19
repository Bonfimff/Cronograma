import { useData } from '../hooks';
import { store } from '../../core/storage/store';
import { addDays, fmtShort, today, weekdayName } from '../../core/dates';
import { KIND_LABEL } from '../../core/planning/weeks';
import { applyPackage, checkPackage, type ApplyResult, type WeekPackage } from '../../core/planning/weekPackage';
import { rascunhoDaSessao, rascunhoVazio } from '../../core/planning/rascunhoAula';
import { EditorDeAula } from '../components/EditorDeAula';

/** O aluno monta uma aula do jeito dele, sem IA, ou edita uma que ainda não começou. */
export function MontarAulaPage({ id, dia }: { id?: string; dia?: string }) {
  const data = useData();
  const editando = id ? data.sessions.find((s) => s.id === id) : undefined;
  const inicial = editando ? rascunhoDaSessao(editando, data) : rascunhoVazio(dia ?? addDays(today(), 1));

  const salvar = (pkg: WeekPackage) => {
    const check = checkPackage(store.get(), pkg, { replacePlanned: false });
    if (!check.ok) return { ok: false, erros: check.errors };
    let r: ApplyResult | null = null;
    store.update((d) => { r = applyPackage(d, pkg, { replacePlanned: false }); });
    const code = r ? ((r as ApplyResult).created[0] ?? (r as ApplyResult).updated[0]) : '';
    const date = pkg.days[0].date;
    return { ok: true, erros: [], mensagem: `Aula ${code} ${editando ? 'atualizada' : 'criada'} para ${weekdayName(date)} ${fmtShort(date)}.` };
  };

  const planejadas = data.sessions.filter((s) => s.date >= today() && s.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Montar aula</p>
        <h1>{editando ? `Editar: ${editando.title}` : 'Aula do seu jeito'}</h1>
        <p className="lead">Monte uma aula à mão, sem IA. Para gerar uma semana inteira com IA, use <a href="#/montar">o pacote semanal</a>.</p>
      </section>

      {id && !editando && <p className="erro">Aula {id} não encontrada.</p>}
      {editando && editando.status !== 'planned' && <p className="erro">Essa aula já foi iniciada: as alterações não serão aplicadas.</p>}

      <EditorDeAula
        key={id ?? dia ?? 'nova'}
        dados={data}
        inicial={inicial}
        quem="você"
        salvar={salvar}
        cancelar={editando ? () => { location.hash = `#/sessao/${editando.id}`; } : undefined}
      />

      {!editando && planejadas.length > 0 && (
        <section>
          <h2>Aulas por fazer</h2>
          <ul className="prof-lista">
            {planejadas.map((s) => (
              <li key={s.id}>
                <span><b>{weekdayName(s.date)} {fmtShort(s.date)}</b> · <span className={`kind k-${s.kind}`}>{KIND_LABEL[s.kind]}</span> {s.title}</span>
                <a className="ghost small" href={`#/montar-aula/${s.id}`}>Editar</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
