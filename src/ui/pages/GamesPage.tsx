import { useMemo } from 'react';
import { IconCards, IconGrid, IconLink, IconMic, IconTetris, Praise } from '../components/Doodles';
import { CatTeacher, Raccoon } from '../components/Cutouts';
import { useData, useRoute } from '../hooks';
import { focoDeEstudo } from '../../core/estudo/foco';

/** Lista de jogos: ícone e nome, sem mais nada. A explicação aparece dentro de cada jogo. */
const JOGOS = [
  { to: 'tetris', nome: 'Tetris', Icon: IconTetris },
  { to: 'palavras', nome: 'Ligar palavras', Icon: IconLink },
  { to: 'cruzadas', nome: 'Cruzadas', Icon: IconGrid },
  { to: 'flashcards', nome: 'Flashcards', Icon: IconCards },
  { to: 'fala', nome: 'Fala-Rápida', Icon: IconMic },
];

/**
 * Jogos com foco: o mesmo jogo pode treinar o vocabulário inteiro, as palavras da aula em foco
 * ou as que estão escapando (core/estudo/foco.ts). A escolha vai no endereço de cada jogo.
 */
export function GamesPage() {
  const data = useData();
  const route = useRoute();
  const foco = useMemo(() => focoDeEstudo(data), [data]);
  const opcoes = [
    { chave: 'tudo', nome: 'Todo o vocabulário' },
    ...(foco.aula?.palavras.length ? [{ chave: `aula:${foco.aula.sessao.id}`, nome: `Aula: ${foco.aula.sessao.title}`, n: foco.aula.palavras.length }] : []),
    ...(foco.revisar.length ? [{ chave: 'revisar', nome: 'Estão escapando', n: foco.revisar.length }] : []),
  ];
  // sem escolha, o padrão é o que mais ajuda agora: as que escapam, depois a aula
  const pedido = route.query.get('foco');
  const escolhido = opcoes.some((o) => o.chave === pedido) ? pedido! : (opcoes[2]?.chave ?? opcoes[1]?.chave ?? 'tudo');
  const sufixo = escolhido === 'tudo' ? '' : `?foco=${encodeURIComponent(escolhido)}`;

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

      {opcoes.length > 1 && (
        <section className="foco-escolha">
          <p className="muted">Jogar com</p>
          <p className="chips">
            {opcoes.map((o) => (
              <a key={o.chave} href={`#/jogos?foco=${encodeURIComponent(o.chave)}`} className={`chip${o.chave === escolhido ? ' on' : ''}`}>
                {o.nome} {'n' in o && <small>{o.n}</small>}
              </a>
            ))}
          </p>
        </section>
      )}

      <section className="jogo-grade">
        {JOGOS.map((j) => (
          <a key={j.to} className="jogo-bloco" href={`#/jogos/${j.to}${sufixo}`}>
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
