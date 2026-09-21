import { Device, Praise } from '../components/Doodles';
import { CatTeacher } from '../components/Cutouts';

export function GamesPage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Jogos</p>
        <h1>Pratique jogando</h1>
        <p className="lead">Jogos curtos que usam o mesmo vocabulário do seu conteúdo.</p>
        <div className="chalk-row">
          <blockquote className="chalk">
            “Mesmo objetivo.<br />Mais leve. Do seu jeito.”
            <span className="chalk-sub">Pequenos passos, grandes resultados.</span>
          </blockquote>
          <CatTeacher className="cut-aside" width="96" />
        </div>
      </section>
      <section className="game-cards">
        <a className="game-card" href="#/jogos/tetris">
          <span className="game-card-head">
            <b>Tetris de vocabulário</b>
            <Device className="doodle mark" width="26" />
          </span>
          <span>Traduza a palavra em português antes que a peça caia. Acertar encaixa a peça; errar deixa a pilha bagunçada.</span>
        </a>
      </section>
      <p className="praise-line"><Praise>tá bom demais!</Praise></p>
    </>
  );
}
