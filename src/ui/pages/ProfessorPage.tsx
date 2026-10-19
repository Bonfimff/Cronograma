import { useEffect, useState } from 'react';
import { api, type Acessos, type SyncRecord } from '../../core/api/client';
import { session } from '../../core/api/session';
import { dadosDeRegistros } from '../../core/api/sync';
import type { UserData } from '../../core/types';
import { Empty } from '../components/common';
import { ProgressPage } from './ProgressPage';
import { AgendaAluno, useGravar } from './professor/Turma';
import { MontarAula } from './professor/MontarAula';

const ABAS = [['progresso', 'Progresso'], ['aula', 'Montar aula'], ['agenda', 'Agenda']] as const;

/**
 * Professores e alunos.
 *
 * Como aluno: autorizo o e-mail de um professor (a conta dele já precisa existir) e tiro
 * o acesso quando quiser. Como professor: vejo a lista de quem me autorizou, abro o
 * relatório de progresso de cada um, monto aulas e marco a próxima no calendário.
 */
export function ProfessorPage({ aluno, aba = 'progresso' }: { aluno?: string; aba?: string }) {
  const [acessos, setAcessos] = useState<Acessos | null>(null);
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [registros, setRegistros] = useState<SyncRecord[] | null>(null);
  const dados: UserData | null = registros && dadosDeRegistros(registros);
  const { gravar, erro: erroGravar, gravando } = useGravar(Number(aluno), (novos) => {
    const chave = (r: SyncRecord) => `${r.kind}/${r.id}`;
    const trocados = new Set(novos.map(chave));
    setRegistros((atual) => [...(atual ?? []).filter((r) => !trocados.has(chave(r))), ...novos.filter((r) => !r.deleted)]);
  });
  const [eu, setEu] = useState('');

  useEffect(() => {
    session.withToken((t) => api.acessos(t)).then(setAcessos).catch((e) => setErro(String(e.message ?? e)));
    setEu(session.get().email ?? '');
  }, []);

  useEffect(() => {
    setRegistros(null);
    if (!aluno) return;
    session.withToken((t) => api.dadosDoAluno(t, Number(aluno)))
      .then(setRegistros)
      .catch((e) => setErro(String(e.message ?? e)));
  }, [aluno]);

  if (aluno) {
    const quem = acessos?.alunos.find((a) => String(a.id) === aluno)?.email;
    return (
      <>
        <p className="no-print"><a href="#/professor">← Meus alunos</a></p>
        <nav className="seg no-print" aria-label="Seções do aluno">
          {ABAS.map(([id, nome]) => (
            <button key={id} type="button" className={aba === id ? 'on' : ''} onClick={() => { location.hash = `#/professor/${aluno}/${id}`; }}>{nome}</button>
          ))}
        </nav>
        {(erro || erroGravar) && <p className="erro">{erro || erroGravar}</p>}
        {!dados ? !erro && <p className="muted">Carregando o histórico…</p>
          : aba === 'aula' ? <MontarAula dados={dados} aluno={quem ?? 'aluno'} gravar={gravar} gravando={gravando} />
          : aba === 'agenda' ? <AgendaAluno dados={dados} professor={eu} gravar={gravar} gravando={gravando} />
          : <ProgressPage dados={dados} aluno={quem ?? 'aluno'} />}
      </>
    );
  }

  const autorizar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErro('');
    try {
      setAcessos(await session.withToken((t) => api.autorizarProfessor(t, email)));
      setEmail('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const revogar = async (id: number) => {
    setAcessos(await session.withToken((t) => api.revogarProfessor(t, id)));
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Professor</p>
        <h1>Professores e alunos</h1>
        <p className="lead">Dê a um professor acesso ao seu histórico e ao relatório de progresso. Ele também pode montar aulas para você e marcar a próxima no calendário.</p>
      </section>

      {erro && <p className="erro">{erro}</p>}

      <section className="paper-card">
        <h2>Meus professores</h2>
        <form onSubmit={autorizar} className="linha-form">
          <input type="email" required placeholder="e-mail da conta do professor" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit">Autorizar</button>
        </form>
        <p className="muted">O professor precisa ter criado a conta dele no Eita antes.</p>
        {acessos?.professores.length ? (
          <ul className="prog-confusoes">
            {acessos.professores.map((p) => (
              <li key={p.id}>{p.email} <button type="button" className="ghost small" onClick={() => void revogar(p.id)}>Tirar acesso</button></li>
            ))}
          </ul>
        ) : <p className="muted">Nenhum professor autorizado.</p>}
      </section>

      <section>
        <h2>Meus alunos</h2>
        {acessos?.alunos.length ? (
          <ul className="prog-confusoes">
            {acessos.alunos.map((a) => <li key={a.id}><b>{a.email}</b>: <a href={`#/professor/${a.id}`}>progresso</a> · <a href={`#/professor/${a.id}/aula`}>montar aula</a> · <a href={`#/professor/${a.id}/agenda`}>agenda</a></li>)}
          </ul>
        ) : <Empty>Quando um aluno autorizar o seu e-mail, ele aparece aqui.</Empty>}
      </section>
    </>
  );
}
