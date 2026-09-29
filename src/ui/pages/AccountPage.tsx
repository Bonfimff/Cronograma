import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, ApiError, type Account } from '../../core/api/client';
import { session } from '../../core/api/session';
import { Philosopher } from '../components/Cutouts';

/**
 * Conta: entrar, criar conta e ver o que está guardado no servidor.
 *
 * Ter conta é opcional — o aplicativo funciona inteiro sem ela, no aparelho. A
 * conta serve para levar o estudo de um aparelho para outro.
 */

const MIN_SENHA = 8;

function useSession() {
  return useSyncExternalStore((cb) => session.subscribe(cb), () => session.get());
}

export function AccountPage() {
  const estado = useSession();
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conta, setConta] = useState<Account | null>(null);

  // com a sessão ligada, busca o resumo do que está no servidor
  useEffect(() => {
    if (!estado.tokens) { setConta(null); return; }
    let vivo = true;
    session.account()
      .then((c) => { if (vivo) { setConta(c); setErro(null); } })
      .catch((e) => { if (vivo) setErro(e instanceof ApiError ? e.message : 'Não foi possível falar com o servidor.'); });
    return () => { vivo = false; };
  }, [estado.tokens]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < MIN_SENHA) return setErro(`A senha precisa de pelo menos ${MIN_SENHA} caracteres.`);
    setOcupado(true);
    try {
      if (modo === 'criar') await session.signUp(email, senha);
      else await session.signIn(email, senha);
      setSenha('');
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível falar com o servidor.');
    } finally {
      setOcupado(false);
    }
  };

  const sairDeTodos = async () => {
    if (!confirm('Desconectar a conta de todos os aparelhos?')) return;
    setOcupado(true);
    try { await session.signOutEverywhere(); } finally { setOcupado(false); }
  };

  if (!api.configured) {
    return (
      <>
        <section className="hero">
          <p className="eyebrow">Conta</p>
          <h1>Sem servidor configurado</h1>
          <p className="lead">
            Esta versão do aplicativo foi publicada sem endereço de servidor, então não há conta nem
            sincronização. Seus dados continuam no aparelho — use <a href="#/dados">Backup dos dados</a> para
            levá-los para outro lugar.
          </p>
        </section>
      </>
    );
  }

  if (estado.tokens) {
    return (
      <>
        <section className="hero">
          <p className="eyebrow">Conta</p>
          <h1>Você está conectado <Philosopher className="cut-title" width="74" /></h1>
          <p className="lead">{estado.email}</p>
        </section>

        <section>
          <h2>No servidor</h2>
          {erro && <p className="aviso">{erro}</p>}
          <dl className="facts">
            <dt>Registros guardados</dt><dd>{conta ? conta.records : '—'}</dd>
            <dt>Revisão do servidor</dt><dd>{conta ? conta.revision : '—'}</dd>
            <dt>Já aplicado aqui</dt><dd>{estado.revision}</dd>
          </dl>
        </section>

        <section className="actions left">
          <button className="ghost" onClick={() => session.signOut()}>Sair deste aparelho</button>
          <button className="ghost" onClick={sairDeTodos} disabled={ocupado}>Sair de todos os aparelhos</button>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Conta</p>
        <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'} <Philosopher className="cut-title" width="74" /></h1>
        <p className="lead">
          A conta serve para continuar o estudo em outro aparelho. Sem ela, o aplicativo funciona
          igual — só não sai daqui.
        </p>
      </section>

      <section>
        <form className="form conta-form" onSubmit={enviar}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>

          <label>
            Senha
            <span className="senha-campo">
              <input
                type={verSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                minLength={MIN_SENHA}
                required
              />
              <button type="button" className="link" onClick={() => setVerSenha((v) => !v)}>
                {verSenha ? 'ocultar' : 'mostrar'}
              </button>
            </span>
            <small className="muted">Pelo menos {MIN_SENHA} caracteres.</small>
          </label>

          {erro && <p className="aviso">{erro}</p>}

          <div className="actions left">
            <button className="primary" type="submit" disabled={ocupado}>
              {ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null); }}
            >
              {modo === 'entrar' ? 'Criar uma conta' : 'Já tenho conta'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
