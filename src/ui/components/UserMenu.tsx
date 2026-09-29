import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { session } from '../../core/api/session';

/**
 * Botão da conta, no alto à direita de todas as abas. Fechado, mostra a inicial
 * de quem entrou (ou um boneco, quando ninguém entrou). Aberto, mostra o e-mail
 * e as saídas: ir para a conta e sair.
 */
export function UserMenu() {
  const estado = useSyncExternalStore((cb) => session.subscribe(cb), () => session.get());
  const [aberto, setAberto] = useState(false);
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
              <a href="#/dados" role="menuitem" onClick={() => setAberto(false)}>Backup dos dados</a>
              <button
                role="menuitem"
                className="usuario-sair"
                onClick={() => { setAberto(false); session.signOut(); }}
              >
                Sair da conta
              </button>
            </>
          ) : (
            <>
              <a href="#/conta" role="menuitem" onClick={() => setAberto(false)}>Entrar</a>
              <a href="#/conta" role="menuitem" onClick={() => setAberto(false)}>Criar conta</a>
              <a href="#/dados" role="menuitem" onClick={() => setAberto(false)}>Backup dos dados</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
