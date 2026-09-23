import { Device, Praise } from '../components/Doodles';
import { CatTeacher, Raccoon } from '../components/Cutouts';

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
        <a className="game-card" href="#/jogos/palavras">
          <span className="game-card-head">
            <b>Ligar palavras</b>
          </span>
          <span>Ligue cada palavra em português à tradução em inglês. Acertou, estala o chicote e a linha fica marcada.</span>
        </a>
        <a className="game-card" href="#/jogos/cruzadas">
          <span className="game-card-head">
            <b>Palavras cruzadas</b>
          </span>
          <span>As dicas são as traduções em português; as respostas, as palavras em inglês. Cada cruzada é montada na hora com o seu vocabulário.</span>
        </a>
        <a className="game-card" href="#/jogos/flashcards">
          <span className="game-card-head">
            <b>Flashcards</b>
          </span>
          <span>Veja a palavra, tente lembrar o significado e toque no cartão para conferir tradução e exemplos.</span>
        </a>
      </section>
      <p className="praise-line">
        <Praise>tá bom demais!</Praise>
        <Raccoon className="cut-inline" width="70" />
      </p>
    </>
  );
}
