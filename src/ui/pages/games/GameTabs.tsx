/** Abas dos jogos (Tetris / Palavras / Flashcards). "Palavras" ainda não existe. */
export function GameTabs({ on }: { on: 'tetris' | 'flashcards' }) {
  return (
    <div className="wt-tabs">
      <a href="#/jogos/tetris" className={on === 'tetris' ? 'on' : ''}>Tetris</a>
      <span title="Em breve">Palavras</span>
      <a href="#/jogos/flashcards" className={on === 'flashcards' ? 'on' : ''}>Flashcards</a>
    </div>
  );
}
