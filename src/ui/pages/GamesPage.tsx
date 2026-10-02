import { IconCards, IconGrid, IconLink, IconMic, IconTetris, Praise } from '../components/Doodles';
import { CatTeacher, Raccoon } from '../components/Cutouts';

/** Lista de jogos: ícone e nome, sem mais nada. A explicação aparece dentro de cada jogo. */
const JOGOS = [
  { to: 'tetris', nome: 'Tetris', Icon: IconTetris },
  { to: 'palavras', nome: 'Ligar palavras', Icon: IconLink },
  { to: 'cruzadas', nome: 'Cruzadas', Icon: IconGrid },
  { to: 'flashcards', nome: 'Flashcards', Icon: IconCards },
  { to: 'fala', nome: 'Fala-Rápida', Icon: IconMic },
];

export function GamesPage() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Jogos</p>
        <h1>Pratique jogando</h1>
        <div className="chalk-row">
          <blockquote className="chalk">
            “Mesmo objetivo.<br />Mais leve. Do seu jeito.”
            <span className="chalk-sub">Pequenos passos, grandes resultados.</span>
          </blockquote>
          <CatTeacher className="cut-aside" width="96" />
        </div>
      </section>

      <section className="jogo-grade">
        {JOGOS.map((j) => (
          <a key={j.to} className="jogo-bloco" href={`#/jogos/${j.to}`}>
            <j.Icon className="jogo-icone" width="52" />
            <span>{j.nome}</span>
          </a>
        ))}
      </section>

      <p className="praise-line">
        <Praise>tá bom demais!</Praise>
        <Raccoon className="cut-inline" width="70" />
      </p>
    </>
  );
}
