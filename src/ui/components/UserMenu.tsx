import { IconeKit } from './Doodles';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { session } from '../../core/api/session';
import { aplicarTema, temaAtual, type Tema } from '../../core/tema';

/**
 * Botão da conta, no alto à direita de todas as abas. Fechado, mostra a inicial
 * de quem entrou (ou um boneco, quando ninguém entrou). Aberto, mostra o e-mail
 * e as saídas: ir para a conta e sair.
 */
export function UserMenu() {
  const estado = useSyncExternalStore((cb) => session.subscribe(cb), () => session.get());
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState<Tema>(temaAtual);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const trocarTema = () => {
    const novo: Tema = tema === 'claro' ? 'escuro' : 'claro';
    aplicarTema(novo);
    setTema(novo);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', novo === 'claro' ? '#ece3d0' : '#0d0d0d');
  };

  const dentro = !!estado.tokens;
  const inicial = estado.email?.trim()[0]?.toUpperCase();

  return (
    <div className="usuario" ref={caixa}>
      <button
        className={`usuario-bt ${dentro ? 'dentro' : ''}`}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label="Conta"
      >
        {dentro && inicial ? inicial : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8.5" r="3.6" />
            <path d="M4.8 20c.9-3.8 3.7-5.8 7.2-5.8s6.3 2 7.2 5.8" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {aberto && (
        <div className="usuario-menu" role="menu">
          {dentro ? (
            <>
              <p className="usuario-email">{estado.email}</p>
              <a href="#/conta" role="menuitem" onClick={() => setAberto(false)}>Minha conta</a>
              <a href="#/conversa" role="menuitem" onClick={() => setAberto(false)}>Conversa</a>
              <a href="#/progresso" role="menuitem" onClick={() => setAberto(false)}>Meu progresso</a>
              <a href="#/professor" role="menuitem" onClick={() => setAberto(false)}>Professores e alunos</a>
              <a href="#/ajustes" role="menuitem" className="com-icone" onClick={() => setAberto(false)}><IconeKit nome="ajustes" width={20} />Ajustes</a>
              <button role="menuitem" className="com-icone" onClick={trocarTema}><IconeKit nome={tema === 'claro' ? 'tema-escuro' : 'tema-claro'} width={20} />{tema === 'claro' ? 'Tema escuro' : 'Tema claro'}</button>
              <button
                role="menuitem"
                className="usuario-sair"
                onClick={() => { setAberto(false); session.signOut(); }}
              >
                <IconeKit nome="sair" width={20} />Sair da conta
              </button>
            </>
          ) : (
            <>
              <a href="#/conta" role="menuitem" onClick={() => setAberto(false)}>Entrar</a>
              <a href="#/conta" role="menuitem" onClick={() => setAberto(false)}>Criar conta</a>
              <a href="#/progresso" role="menuitem" onClick={() => setAberto(false)}>Meu progresso</a>
              <a href="#/professor" role="menuitem" onClick={() => setAberto(false)}>Professores e alunos</a>
              <a href="#/ajustes" role="menuitem" className="com-icone" onClick={() => setAberto(false)}><IconeKit nome="ajustes" width={20} />Ajustes</a>
              <button role="menuitem" className="com-icone" onClick={trocarTema}><IconeKit nome={tema === 'claro' ? 'tema-escuro' : 'tema-claro'} width={20} />{tema === 'claro' ? 'Tema escuro' : 'Tema claro'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
