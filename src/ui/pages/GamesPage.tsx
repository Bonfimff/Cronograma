export function GamesPage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Jogos</p>
        <h1>Pratique jogando</h1>
        <p className="lead">Jogos curtos que usam o mesmo vocabulário do seu conteúdo.</p>
      </section>
      <section className="game-cards">
        <a className="game-card" href="#/jogos/tetris">
          <b>Tetris de vocabulário</b>
          <span>Traduza a palavra em português antes que a peça caia. Acertar encaixa a peça; errar deixa a pilha bagunçada.</span>
        </a>
      </section>
    </>
  );
}
