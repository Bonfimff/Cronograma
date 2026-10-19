import { useMemo, useState } from 'react';
import { api, type SyncRecord } from '../../../core/api/client';
import { session } from '../../../core/api/session';
import { addDays, fmtShort, today, weekdayName } from '../../../core/dates';

import {
  agoraLocal, fimDe, novoAgendamento, proximasAulas, registroDoAgendamento,
} from '../../../core/professor/montagem';
import type { Agendamento, UserData } from '../../../core/types';
import { livreEm, periodoDa, PERIODOS } from '../../../core/planning/disponibilidade';
import { DisponibilidadeDoAluno } from '../../components/Disponibilidade';

/** Grava na conta do aluno e devolve o que o servidor aceitou. */
export function useGravar(alunoId: number, aoGravar: (itens: SyncRecord[]) => void) {
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const gravar = async (itens: SyncRecord[]) => {
    if (!itens.length) return false;
    setErro('');
    setGravando(true);
    try {
      aoGravar(await session.withToken((t) => api.gravarNoAluno(t, alunoId, itens)));
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGravando(false);
    }
  };
  return { gravar, erro, gravando };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

/** Os dias do mês em semanas que começam na segunda (com os dias vizinhos completando). */
function diasDoMes(mes: string): string[] {
  const primeiro = `${mes}-01`;
  const recuo = (new Date(`${primeiro}T00:00`).getDay() + 6) % 7;
  const inicio = addDays(primeiro, -recuo);
  return Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
}

const proximoMes = (mes: string, n: number) => {
  const d = new Date(`${mes}-01T00:00`);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const horaDe = (a: Agendamento) => `${a.inicio.slice(11)} às ${fimDe(a).slice(11)}`;

/** Calendário do mês: tocar num dia abre o horário para marcar a próxima aula. */
export function AgendaAluno({ dados, aluno, professor, gravar, gravando }: {
  dados: UserData; aluno: string; professor: string; gravar: (itens: SyncRecord[]) => Promise<boolean>; gravando: boolean;
}) {
  const [mes, setMes] = useState(today().slice(0, 7));
  const [dia, setDia] = useState(today());
  const [hora, setHora] = useState('19:00');
  const [duracao, setDuracao] = useState(60);
  const [assunto, setAssunto] = useState('');
  const [nota, setNota] = useState('');
  const [sessaoId, setSessaoId] = useState('');
  const [aviso, setAviso] = useState('');
  // aula sendo remarcada: o formulário mostra os dados dela e salvar troca no lugar
  const [remarcando, setRemarcando] = useState<Agendamento | null>(null);

  const agenda = dados.agenda ?? [];
  const porDia = useMemo(() => {
    const m = new Map<string, Agendamento[]>();
    agenda.forEach((a) => m.set(a.inicio.slice(0, 10), [...(m.get(a.inicio.slice(0, 10)) ?? []), a]));
    return m;
  }, [agenda]);
  const aulasDoDia = dados.sessions.filter((s) => s.date === dia);
  const doDia = (porDia.get(dia) ?? []).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const proximas = proximasAulas(agenda);

  const marcar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setAviso('');
    const inicio = `${dia}T${hora}`;
    if (inicio < agoraLocal()) { setAviso('Esse horário já passou.'); return; }
    const choque = agenda.find((a) => a.id !== remarcando?.id && a.inicio < fimDe({ inicio, duracao } as Agendamento) && fimDe(a) > inicio);
    if (choque && !confirm(`Já há uma aula de ${horaDe(choque)} nesse dia. Marcar mesmo assim?`)) return;
    const campos = { inicio, duracao, assunto: assunto.trim() || 'Aula', nota: nota.trim() || undefined, sessaoId: sessaoId || undefined, professor };
    const aula = remarcando ? { ...remarcando, ...campos } : novoAgendamento(campos);
    if (await gravar([registroDoAgendamento(aula)])) {
      setAviso(`${remarcando ? 'Aula remarcada para' : 'Aula marcada:'} ${weekdayName(dia)} ${fmtShort(dia)}, ${horaDe(aula)}.`);
      setAssunto(''); setNota(''); setSessaoId(''); setRemarcando(null);
    }
  };

  const remarcar = (a: Agendamento) => {
    const d = a.inicio.slice(0, 10);
    setRemarcando(a);
    setDia(d); setMes(d.slice(0, 7)); setHora(a.inicio.slice(11)); setDuracao(a.duracao);
    setAssunto(a.assunto); setNota(a.nota ?? ''); setSessaoId(a.sessaoId ?? ''); setAviso('');
    document.querySelector('.agenda-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const cancelarRemarcar = () => { setRemarcando(null); setAssunto(''); setNota(''); setSessaoId(''); setAviso(''); };

  const desmarcar = (a: Agendamento) => {
    if (confirm(`Desmarcar a aula de ${fmtShort(a.inicio.slice(0, 10))}, ${horaDe(a)}?`)) {
      void gravar([{ kind: 'agenda', id: a.id, data: {}, deleted: true }]);
    }
  };

  const [ano, m] = mes.split('-').map(Number);
  const nomeAluno = aluno.split('@')[0];
  const livresNoDia = livreEm(dados.disponibilidade, dia);
  const foraDoLivre = !!dados.disponibilidade && !livresNoDia.includes(periodoDa(hora));
  return (
    <>
      <DisponibilidadeDoAluno disp={dados.disponibilidade} nome={nomeAluno} />

      <section>
        <h2>Próximas aulas marcadas</h2>
        {proximas.length ? (
          <ul className="prof-lista">
            {proximas.map((a) => (
              <li key={a.id}>
                <span><b>{weekdayName(a.inicio.slice(0, 10))} {fmtShort(a.inicio.slice(0, 10))}</b>, {horaDe(a)} · {a.assunto}</span>
                <span className="prof-botoes">
                  <button type="button" className="ghost small" disabled={gravando} onClick={() => remarcar(a)}>Remarcar</button>
                  <button type="button" className="ghost small" disabled={gravando} onClick={() => desmarcar(a)}>Desmarcar</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Nenhuma aula marcada. Escolha um dia no calendário.</p>}
      </section>

      <section className="agenda-cal">
        <div className="cal-topo">
          <button type="button" className="ghost small" aria-label="Mês anterior" onClick={() => setMes(proximoMes(mes, -1))}>‹</button>
          <h2>{MESES[m - 1]} {ano}</h2>
          <button type="button" className="ghost small" aria-label="Próximo mês" onClick={() => setMes(proximoMes(mes, 1))}>›</button>
        </div>
        <div className="cal-grade">
          {SEMANA.map((s) => <span key={s} className="cal-sem">{s}</span>)}
          {diasDoMes(mes).map((d) => {
            const marcas = porDia.get(d)?.length ?? 0;
            const aulas = dados.sessions.filter((s) => s.date === d).length;
            return (
              <button
                key={d} type="button"
                className={['cal-dia', livreEm(dados.disponibilidade, d).length > 0 && d >= today() && 'livre', d.slice(0, 7) !== mes && 'fora', d === today() && 'hoje', d === dia && 'on', d < today() && 'passado'].filter(Boolean).join(' ')}
                onClick={() => setDia(d)}
                aria-label={`${weekdayName(d)} ${fmtShort(d)}${marcas ? `, ${marcas} marcada(s)` : ''}`}
              >
                {Number(d.slice(8))}
                <span className="cal-pontos">
                  {marcas > 0 && <i className="marca" />}
                  {aulas > 0 && <i className="aula" />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted small-text cal-legenda"><i className="cal-leg marca" /> aula marcada <i className="cal-leg aula" /> aula no app{dados.disponibilidade && <><i className="cal-leg livre" /> dia livre do aluno</>}</p>
      </section>

      <form className="form agenda-form" onSubmit={marcar}>
        {remarcando && (
          <p className="ed-ajuda">
            Remarcando a aula de <b>{fmtShort(remarcando.inicio.slice(0, 10))}, {horaDe(remarcando)}</b>. Escolha o novo dia no calendário e ajuste a hora.
          </p>
        )}
        <h2>{remarcando ? 'Novo horário: ' : ''}{weekdayName(dia)}, {fmtShort(dia)}</h2>
        {doDia.length > 0 && (
          <ul className="plain">{doDia.filter((a) => a.id !== remarcando?.id).map((a) => <li key={a.id}>{horaDe(a)} · {a.assunto}</li>)}</ul>
        )}
        {dia < today() ? <p className="muted">Esse dia já passou.</p> : (
          <>
            {dados.disponibilidade && (
              <p className={`small-text ${foraDoLivre ? 'disp-aviso' : 'muted'}`}>
                {livresNoDia.length
                  ? `${nomeAluno} está livre neste dia de ${livresNoDia.map((p) => PERIODOS.find((x) => x.p === p)!.nome.toLowerCase()).join(' e ')}.`
                  : `${nomeAluno} não marcou este dia como livre.`}
                {foraDoLivre && livresNoDia.length > 0 && ' O horário escolhido está fora disso.'}
              </p>
            )}
            <div className="prof-hora">
              <label>Hora<input type="time" required value={hora} onChange={(e) => setHora(e.target.value)} /></label>
              <label>Duração
                <select value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                  {[30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
                </select>
              </label>
            </div>
            <label>Assunto<input maxLength={120} value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="ex.: Conversação, revisão da semana" /></label>
            {aulasDoDia.length > 0 && (
              <label>Aula do app ligada a este horário
                <select value={sessaoId} onChange={(e) => setSessaoId(e.target.value)}>
                  <option value="">nenhuma</option>
                  {aulasDoDia.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.id})</option>)}
                </select>
              </label>
            )}
            <label>Recado para o aluno<textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="opcional" /></label>
            {aviso && <p className="ok-line">{aviso}</p>}
            <div className="actions">
              {remarcando && <button type="button" className="ghost" onClick={cancelarRemarcar}>Cancelar</button>}
              <button className="primary" type="submit" disabled={gravando}>{gravando ? 'Gravando…' : remarcando ? 'Remarcar aula' : 'Marcar aula'}</button>
            </div>
          </>
        )}
      </form>
    </>
  );
}
