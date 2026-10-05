import { useRoute } from '../../hooks';

/** Abas dos jogos. Trocar de jogo mantém o foco escolhido (aula, quase esquecidas…). */
export function GameTabs({ on }: { on: 'tetris' | 'palavras' | 'cruzadas' | 'flashcards' | 'fala' }) {
  const foco = useRoute().query.get('foco');
  const q = foco ? `?foco=${encodeURIComponent(foco)}` : '';
  return (
    <div className="wt-tabs">
      <a href={`#/jogos/tetris${q}`} className={on === 'tetris' ? 'on' : ''}>Tetris</a>
      <a href={`#/jogos/palavras${q}`} className={on === 'palavras' ? 'on' : ''}>Palavras</a>
      <a href={`#/jogos/cruzadas${q}`} className={on === 'cruzadas' ? 'on' : ''}>Cruzadas</a>
      <a href={`#/jogos/flashcards${q}`} className={on === 'flashcards' ? 'on' : ''}>Flashcards</a>
      <a href={`#/jogos/fala${q}`} className={on === 'fala' ? 'on' : ''}>Fala</a>
    </div>
  );
}
