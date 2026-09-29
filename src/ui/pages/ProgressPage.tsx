import { useData } from '../hooks';
import { GAME_KEYS } from '../../core/storage/backup';
import type { WordStats } from '../../core/games/wordTetris';
import {
  bestWords, exerciseAccuracy, frequency, hardestWords, learningSpeed, type WordScore,
} from '../../core/progress/progress';
import { refLabel } from '../../core/content/repository';
import { fmtShort, weekdayShort } from '../../core/dates';
import { Empty } from '../components/common';
import { CatTeacher } from '../components/Cutouts';

/** Meu progresso: o que já gruda, o que ainda escapa, com que frequência estudo e em quanto tempo uma palavra nova se firma. */

function loadStats(): WordStats {
  try {
    const raw = localStorage.getItem(GAME_KEYS.tetrisWordStats);
    return raw ? (JSON.parse(raw) as WordStats) : {};
  } catch {
    return {};
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Palavras({ lista, vazio }: { lista: WordScore[]; vazio: string }) {
  if (!lista.length) return <Empty>{vazio}</Empty>;
  return (
    <ul className="placar">
      {lista.map((p) => (
        <li key={p.en}>
          <span className="en">{p.en}</span>
          <span className="placar-barra"><span style={{ width: pct(p.taxa) }} /></span>
          <span className="placar-num">{pct(p.taxa)}</span>
          <small className="muted">{p.certos}/{p.tentativas}</small>
        </li>
      ))}
    </ul>
  );
}

export function ProgressPage() {
  const data = useData();
  const stats = loadStats();
  const bons = bestWords(stats);
  const dificeis = hardestWords(stats);
  const freq = frequency(data);
  const ritmo = learningSpeed(data);
  const acertos = exerciseAccuracy(data);
  const semanas = 12;
  const ultimos = freq.dias.slice(-semanas * 7);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Progresso</p>
        <h1>Meu progresso <CatTeacher className="cut-title" width="74" /></h1>
      </section>

      <section>
        <h2>Resumo</h2>
        <dl className="facts">
          <dt>Dias estudados</dt><dd>{freq.diasEstudados} nas últimas {semanas} semanas</dd>
          <dt>Sequência atual</dt><dd>{freq.sequenciaAtual} {freq.sequenciaAtual === 1 ? 'dia' : 'dias'} (melhor: {freq.melhorSequencia})</dd>
          <dt>Tempo somado</dt><dd>{Math.round(freq.minutosTotais / 6) / 10} h</dd>
          <dt>Acerto nos exercícios</dt><dd>{acertos.taxa === null ? 'sem folhas corrigidas' : `${pct(acertos.taxa)} (${acertos.certos} de ${acertos.total})`}</dd>
        </dl>
      </section>

      <section>
        <h2>Frequência <small>{freq.porSemana} dias por semana</small></h2>
        <div className="calor" role="img" aria-label={`${freq.diasEstudados} dias de estudo nas últimas ${semanas} semanas`}>
          {ultimos.map((d) => (
            <i
              key={d.date}
              className={d.sessoes ? 'on' : ''}
              style={d.sessoes ? { opacity: Math.min(1, 0.45 + d.sessoes * 0.25) } : undefined}
              title={`${fmtShort(d.date)} (${weekdayShort(d.date)}): ${d.sessoes ? `${d.sessoes} sessão(ões), ${d.minutos} min` : 'sem estudo'}`}
            />
          ))}
        </div>
        {!freq.diasEstudados && <Empty>Nenhuma sessão concluída ainda. Ao corrigir uma folha, o dia acende aqui.</Empty>}
      </section>

      <section>
        <h2>Velocidade de aprendizado</h2>
        {ritmo.mediana === null ? (
          <Empty>Ainda não há conteúdo consolidado. Assim que uma palavra passar de nova a firme, o tempo aparece aqui.</Empty>
        ) : (
          <dl className="facts">
            <dt>Tempo típico</dt><dd>{ritmo.mediana} {ritmo.mediana === 1 ? 'dia' : 'dias'} do primeiro contato até firmar</dd>
            <dt>Média</dt><dd>{ritmo.media} dias em {ritmo.concluidos.length} {ritmo.concluidos.length === 1 ? 'conteúdo' : 'conteúdos'}</dd>
            {ritmo.maisRapido && (<><dt>Mais rápido</dt><dd>{refLabel(ritmo.maisRapido.ref)} em {ritmo.maisRapido.dias} dias</dd></>)}
            {ritmo.maisLento && (<><dt>Mais demorado</dt><dd>{refLabel(ritmo.maisLento.ref)} em {ritmo.maisLento.dias} dias</dd></>)}
            <dt>Ainda em curso</dt><dd>{ritmo.emAndamento} {ritmo.emAndamento === 1 ? 'conteúdo' : 'conteúdos'}</dd>
          </dl>
        )}
      </section>

      <section>
        <h2>Palavras que já grudaram</h2>
        <Palavras lista={bons} vazio="Jogue um pouco para o placar encher." />
      </section>

      <section>
        <h2>Palavras que ainda escapam</h2>
        <Palavras lista={dificeis} vazio="Nada errado por aqui ainda." />
      </section>
    </>
  );
}
