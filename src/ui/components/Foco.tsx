import { useMemo } from 'react';
import { useData, useRoute } from '../hooks';
import { palavrasDoFoco, rotuloDoFoco } from '../../core/estudo/foco';
import type { Session } from '../../core/types';
import { IconeKit } from './Doodles';

/** O foco que o endereço pediu (?foco=revisar, ?foco=aula:…): as palavras e um nome curto. */
export function useFocoDoEndereco(): { param: string | null; palavras: string[]; rotulo: string } {
  const data = useData();
  const route = useRoute();
  const param = route.query.get('foco');
  // o foco é decidido ao abrir a tela: a rodada não muda no meio só porque um registro sincronizou
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palavras = useMemo(() => palavrasDoFoco(data, param), [param]);
  return { param, palavras, rotulo: rotuloDoFoco(data, param) };
}

/** Faixa no topo do jogo: com o que está jogando, e o atalho para voltar ao vocabulário inteiro. */
export function FocoAviso({ jogo }: { jogo: string }) {
  const { param, palavras, rotulo } = useFocoDoEndereco();
  if (!param || !palavras.length) return null;
  return (
    <p className="foco-aviso">
      <IconeKit nome="estrela" width={20} />
      <span>Jogando com {rotulo} <small>({palavras.length})</small></span>
      <a href={`#/jogos/${jogo}`}>jogar com tudo</a>
    </p>
  );
}

export interface Passo {
  href: string;
  titulo: string;
  detalhe?: string;
  icone: string;
}

/** Os próximos passos de uma atividade: cartões grandes, um toque para seguir. */
export function ProximosPassos({ passos, titulo = 'Próximos passos' }: { passos: Passo[]; titulo?: string }) {
  if (!passos.length) return null;
  return (
    <section className="proximos">
      <h2>{titulo}</h2>
      <div className="proximos-grade">
        {passos.map((p) => (
          <a key={p.href + p.titulo} className="proximo" href={p.href}>
            <IconeKit nome={p.icone} width={34} />
            <span className="proximo-titulo">{p.titulo}</span>
            {p.detalhe && <small>{p.detalhe}</small>}
          </a>
        ))}
      </div>
    </section>
  );
}

/** O que fazer depois de uma aula: falar, fixar, conversar e voltar para o Hoje. */
export function passosDepoisDaAula(s: Session): Passo[] {
  const foco = `aula:${s.id}`;
  return [
    { href: `#/jogos/fala?foco=${foco}`, titulo: 'Falar as palavras', detalhe: 'Fala-Rápida com a aula', icone: 'microfone2' },
    { href: `#/jogos/flashcards?foco=${foco}`, titulo: 'Fixar', detalhe: 'Flashcards com a aula', icone: 'flashcards' },
    s.treino?.length
      ? { href: `#/conversa?enviar=${encodeURIComponent('Vamos treinar uma conversa')}`, titulo: 'Treinar a conversa', detalhe: `${s.treino.length} perguntas da aula`, icone: 'conversa' }
      : { href: `#/conversa?foco=${foco}`, titulo: 'Conversar', detalhe: 'o amigo usa as palavras da aula', icone: 'conversa' },
    { href: '#/', titulo: 'Voltar para Hoje', icone: 'hoje' },
  ];
}
