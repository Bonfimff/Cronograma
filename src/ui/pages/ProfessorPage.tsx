import { useEffect, useState } from 'react';
import { api, type Acessos } from '../../core/api/client';
import { session } from '../../core/api/session';
import { dadosDeRegistros } from '../../core/api/sync';
import type { UserData } from '../../core/types';
import { Empty } from '../components/common';
import { ProgressPage } from './ProgressPage';

/**
 * Professores e alunos.
 *
 * Como aluno: autorizo o e-mail de um professor (a conta dele já precisa existir) e tiro
 * o acesso quando quiser. Como professor: vejo a lista de quem me autorizou e abro o
 * relatório de progresso de cada um, só para leitura.
 */
export function ProfessorPage({ aluno }: { aluno?: string }) {
  const [acessos, setAcessos] = useState<Acessos | null>(null);
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<UserData | null>(null);

  useEffect(() => {
    session.withToken((t) => api.acessos(t)).then(setAcessos).catch((e) => setErro(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    setDados(null);
    if (!aluno) return;
    session.withToken((t) => api.dadosDoAluno(t, Number(aluno)))
      .then((itens) => setDados(dadosDeRegistros(itens)))
      .catch((e) => setErro(String(e.message ?? e)));
  }, [aluno]);

  if (aluno) {
    const quem = acessos?.alunos.find((a) => String(a.id) === aluno)?.email;
    return (
      <>
        <p className="no-print"><a href="#/professor">← Meus alunos</a></p>
        {erro && <p className="erro">{erro}</p>}
        {dados ? <ProgressPage dados={dados} aluno={quem ?? 'aluno'} /> : !erro && <p className="muted">Carregando o histórico…</p>}
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
        <p className="lead">Dê a um professor acesso ao seu histórico e ao relatório de progresso. Ele só vê, não muda nada.</p>
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
            {acessos.alunos.map((a) => <li key={a.id}><a href={`#/professor/${a.id}`}>{a.email}</a>: ver progresso</li>)}
          </ul>
        ) : <Empty>Quando um aluno autorizar o seu e-mail, ele aparece aqui.</Empty>}
      </section>
    </>
  );
}
