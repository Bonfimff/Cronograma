/** Abas dos jogos (Tetris / Palavras / Flashcards). */
export function GameTabs({ on }: { on: 'tetris' | 'palavras' | 'cruzadas' | 'flashcards' }) {
  return (
    <div className="wt-tabs">
      <a href="#/jogos/tetris" className={on === 'tetris' ? 'on' : ''}>Tetris</a>
      <a href="#/jogos/palavras" className={on === 'palavras' ? 'on' : ''}>Palavras</a>
      <a href="#/jogos/cruzadas" className={on === 'cruzadas' ? 'on' : ''}>Cruzadas</a>
      <a href="#/jogos/flashcards" className={on === 'flashcards' ? 'on' : ''}>Flashcards</a>
    </div>
  );
}
