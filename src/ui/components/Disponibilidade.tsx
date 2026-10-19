import { useState } from 'react';
import { store } from '../../core/storage/store';
import { DIAS, PERIODOS, resumo } from '../../core/planning/disponibilidade';
import type { DiaSemana, Disponibilidade, Periodo } from '../../core/types';
import { useData } from '../hooks';

/** O aluno marca em que dias e períodos da semana pode ter aula. */
export function MinhaDisponibilidade() {
  const data = useData();
  const salva = data.disponibilidade;
  const [dias, setDias] = useState<Disponibilidade['dias']>(salva?.dias ?? {});
  const [nota, setNota] = useState(salva?.nota ?? '');
  const [ok, setOk] = useState(false);

  const tem = (d: DiaSemana, p: Periodo) => !!dias[d]?.includes(p);
  const alternar = (d: DiaSemana, p: Periodo) => {
    setOk(false);
    setDias((x) => {
      const atual = x[d] ?? [];
      const novo = atual.includes(p) ? atual.filter((y) => y !== p) : PERIODOS.map((z) => z.p).filter((z) => z === p || atual.includes(z));
      return { ...x, [d]: novo };
    });
  };
  const salvar = () => {
    const limpos = Object.fromEntries(Object.entries(dias).filter(([, l]) => l?.length)) as Disponibilidade['dias'];
    store.update((d) => { d.disponibilidade = { dias: limpos, nota: nota.trim() || undefined, atualizadoEm: new Date().toISOString() }; });
    setOk(true);
  };

  return (
    <section className="paper-card disp">
      <h2>Quando posso ter aula</h2>
      <p className="muted">Toque nos períodos em que você costuma estar livre. Seu professor vê isso na hora de marcar a próxima aula.</p>
      <div className="disp-grade" role="group" aria-label="Dias e períodos livres">
        <span />
        {PERIODOS.map((p) => <span key={p.p} className="disp-cab">{p.nome}<small>{p.faixa}</small></span>)}
        {DIAS.map((d) => (
          <div key={d.d} className="disp-linha">
            <span className="disp-dia">{d.nome}</span>
            {PERIODOS.map((p) => (
              <button key={p.p} type="button" className={`disp-celula ${tem(d.d, p.p) ? 'on' : ''}`} aria-pressed={tem(d.d, p.p)}
                aria-label={`${d.nome} de ${p.nome.toLowerCase()}`} onClick={() => alternar(d.d, p.p)}>
                {tem(d.d, p.p) ? '✓' : ''}
              </button>
            ))}
          </div>
        ))}
      </div>
      <label>Observação<input value={nota} maxLength={140} onChange={(e) => { setNota(e.target.value); setOk(false); }} placeholder="ex.: à noite só depois das 19h" /></label>
      {ok && <p className="ok-line">Horários salvos.</p>}
      <div className="actions"><button type="button" className="primary" onClick={salvar}>Salvar horários</button></div>
    </section>
  );
}

/** O que o aluno marcou, para o professor ver (só leitura). */
export function DisponibilidadeDoAluno({ disp, nome }: { disp?: Disponibilidade; nome: string }) {
  const texto = resumo(disp);
  return (
    <section className="disp-resumo">
      <h3>Quando {nome} pode ter aula</h3>
      {texto ? (
        <>
          <p>{texto}</p>
          {disp?.nota && <p className="muted">“{disp.nota}”</p>}
          <p className="muted small-text">Os dias livres aparecem com um traço no calendário.</p>
        </>
      ) : <p className="muted">{nome} ainda não marcou os horários livres.</p>}
    </section>
  );
}
