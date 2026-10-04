import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks';
import { GAME_KEYS } from '../../core/storage/backup';
import type { WordStats } from '../../core/games/wordTetris';
import { byWeek, frequency, hardestWords, bestWords, learningSpeed } from '../../core/progress/progress';
import { relatorio, type LinhaTipo, type PalavraPlacar } from '../../core/progress/relatorio';
import { analiseGuardada, analisar, analisePorRegras, type Analise } from '../../core/progress/analise';
import { SketchBars, SketchDots, SketchLine } from '../components/Charts';
import { refLabel } from '../../core/content/repository';
import { fmtShort, weekdayShort } from '../../core/dates';
import { Empty } from '../components/common';
import { CatTeacher } from '../components/Cutouts';
import { IconeKit } from '../components/Doodles';

/**
 * Meu progresso: tudo o que foi feito (aulas, folhas, jogos, fala e conversa) em números
 * claros, e uma análise escrita revisada uma vez por dia pela IA (core/progress/analise.ts).
 */

function loadStats(): WordStats {
  try {
    const raw = localStorage.getItem(GAME_KEYS.tetrisWordStats);
    return raw ? (JSON.parse(raw) as WordStats) : {};
  } catch {
    return {};
  }
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const horas = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function Cartao({ icone, titulo, valor, detalhe }: { icone: string; titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="prog-cartao">
      <IconeKit nome={icone} width={30} />
      <span className="prog-titulo">{titulo}</span>
      <strong>{valor}</strong>
      {detalhe && <small>{detalhe}</small>}
    </div>
  );
}

function TabelaTipos({ linhas }: { linhas: LinhaTipo[] }) {
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead><tr><th>Atividade</th><th className="num">Vezes</th><th className="num">Tempo</th><th className="num">Respostas</th><th className="num">Acerto</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave}>
              <td>{l.rotulo}</td>
              <td className="num">{l.vezes}</td>
              <td className="num">{horas(l.minutos)}</td>
              <td className="num">{l.acertos + l.erros || '—'}</td>
              <td className="num">{pct(l.taxa)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaPalavras({ lista }: { lista: PalavraPlacar[] }) {
  return (
    <div className="tabela-rolagem">
      <table className="tabela">
        <thead><tr><th>Palavra</th><th className="num">Acertos</th><th className="num">Erros</th><th className="num">Acerto</th><th>Última vez</th></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.en}>
              <td className="en">{p.en}</td>
              <td className="num">{p.acertos}</td>
              <td className="num">{p.erros}</td>
              <td className="num">{pct(p.taxa)}</td>
              <td>{fmtShort(p.ultima.slice(0, 10))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** O placar antigo do Tetris (antes do registro de atividades) entra no mesmo formato. */
function doTetris(stats: WordStats, melhores: boolean): PalavraPlacar[] {
  const lista = melhores ? bestWords(stats) : hardestWords(stats);
  return lista.map((w) => ({ en: w.en, acertos: w.certos, erros: w.errados, taxa: w.taxa, ultima: w.ultima ?? w.estreia ?? '' }));
}

export function ProgressPage() {
  const data = useData();
  const r = useMemo(() => relatorio(data), [data]);
  const stats = loadStats();
  const freq = frequency(data);
  const ritmo = learningSpeed(data);
  const semanasEstudo = byWeek(freq);
  const ultimos = freq.dias.slice(-84);
  const [analise, setAnalise] = useState<Analise | null>(() => analiseGuardada());
  const [analisando, setAnalisando] = useState(false);

  // revisão diária: ao abrir a aba, se a análise não é de hoje, pede uma nova
  useEffect(() => {
    let vivo = true;
    setAnalisando(true);
    analisar(r).then((a) => { if (vivo) setAnalise(a); }).finally(() => { if (vivo) setAnalisando(false); });
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const atualizar = () => {
    setAnalisando(true);
    analisar(r, true).then(setAnalise).finally(() => setAnalisando(false));
  };

  const dificeis = r.dificeis.length ? r.dificeis : doTetris(stats, false);
  const firmes = r.firmes.length ? r.firmes : doTetris(stats, true);
  const g = r.geral;
  const tendencia = g.taxa7 !== null && g.taxaAnterior !== null ? (g.taxa7 >= g.taxaAnterior ? '↑' : '↓') + ` antes ${pct(g.taxaAnterior)}` : undefined;
  const semDados = !r.porTipo.length;

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Progresso</p>
        <h1>Meu progresso <CatTeacher className="cut-title" width="74" /></h1>
        <p className="lead">Tudo o que você fez: aulas, folhas, jogos, fala e conversa.</p>
      </section>

      <section className="prog-cartoes">
        <Cartao icone="relogio-fallback" titulo="Estudo (7 dias)" valor={horas(g.minutos7)} detalhe={`${horas(g.minutosTotal)} no total`} />
        <Cartao icone="chama" titulo="Sequência" valor={`${g.sequenciaAtual} ${g.sequenciaAtual === 1 ? 'dia' : 'dias'}`} detalhe={`melhor: ${g.melhorSequencia}`} />
        <Cartao icone="estrela" titulo="Acerto (7 dias)" valor={pct(g.taxa7)} detalhe={tendencia} />
        <Cartao icone="jogos" titulo="Atividades (7 dias)" valor={String(g.atividades7)} detalhe={`${g.diasEstudados30} dias nos últimos 30`} />
        <Cartao icone="conteudo" titulo="Palavras praticadas" valor={String(g.palavrasPraticadas)} detalhe={`${g.palavrasAprendidas} já firmes`} />
        <Cartao icone="microfone2" titulo="Fala" valor={pct(r.fala.taxa)} detalhe={`${r.fala.tentativas} tentativas`} />
      </section>

      <section className="paper-card tape prog-analise">
        <span className="sticker">Análise do dia</span>
        {analise ? (
          <>
            {analise.texto.split('\n').map((l) => <p key={l}>{l}</p>)}
            <p className="prog-fonte">
              {analise.fonte === 'ia' ? 'Escrita pela IA a partir dos seus números' : 'Resumo automático (a IA estava fora do ar)'} · {fmtShort(analise.dia)}
            </p>
          </>
        ) : (
          analisePorRegras(r).split('\n').map((l) => <p key={l}>{l}</p>)
        )}
        <button type="button" className="ghost small" onClick={atualizar} disabled={analisando}>
          {analisando ? 'Analisando…' : 'Atualizar análise'}
        </button>
      </section>

      {semDados ? (
        <Empty>Ainda não há atividades registradas. Jogue, faça uma aula ou converse com o amigo e os números aparecem aqui.</Empty>
      ) : (
        <>
          <section>
            <h2>Evolução <small>últimas 8 semanas</small></h2>
            <p className="muted">Minutos de estudo por semana</p>
            <SketchLine valores={r.semanas.map((s) => s.minutos)} />
            <div className="grafico-rotulos">{r.semanas.map((s, i) => <span key={s.inicio}>{i % 2 === 0 ? fmtShort(s.inicio) : ''}</span>)}</div>
            {r.semanas.filter((s) => s.taxa !== null).length >= 2 && (
              <>
                <p className="muted">Acerto por semana</p>
                <SketchLine valores={r.semanas.map((s) => Math.round((s.taxa ?? 0) * 100))} />
              </>
            )}
          </section>

          <section>
            <h2>Por tipo de atividade</h2>
            <SketchBars itens={r.porTipo.map((t) => ({ label: t.rotulo, valor: t.minutos / Math.max(1, ...r.porTipo.map((x) => x.minutos)) }))} />
            <div className="grafico-rotulos">{r.porTipo.map((t) => <span key={t.chave}>{t.rotulo}</span>)}</div>
            <TabelaTipos linhas={r.porTipo} />
          </section>

          {r.porJogo.length > 0 && (
            <section>
              <h2>Jogos e fala</h2>
              <TabelaTipos linhas={r.porJogo} />
            </section>
          )}

          <section>
            <h2>Horários {r.melhorFaixa && <small>melhor: {r.melhorFaixa.nome.toLowerCase()}</small>}</h2>
            <SketchBars itens={r.faixas.map((f) => ({ label: f.nome, valor: f.minutos / Math.max(1, ...r.faixas.map((x) => x.minutos)) }))} />
            <div className="grafico-rotulos">{r.faixas.map((f) => <span key={f.nome}>{f.nome}</span>)}</div>
            <dl className="facts">
              {r.faixas.filter((f) => f.vezes).map((f) => (
                <span key={f.nome} style={{ display: 'contents' }}>
                  <dt>{f.nome}</dt><dd>{horas(f.minutos)} · acerto {pct(f.taxa)}</dd>
                </span>
              ))}
            </dl>
            <p className="muted">Por dia da semana</p>
            <SketchBars itens={r.minutosPorDiaDaSemana.map((m, i) => ({ label: DIAS[i], valor: m / Math.max(1, ...r.minutosPorDiaDaSemana) }))} altura={90} />
            <div className="grafico-rotulos">{DIAS.map((d) => <span key={d}>{d}</span>)}</div>
          </section>
        </>
      )}

      <section>
        <h2>Palavras que ainda escapam</h2>
        {dificeis.length ? <TabelaPalavras lista={dificeis} /> : <Empty>Nada errado por aqui ainda.</Empty>}
      </section>

      <section>
        <h2>Palavras que já grudaram</h2>
        {firmes.length ? <TabelaPalavras lista={firmes} /> : <Empty>Pratique um pouco para o placar encher.</Empty>}
      </section>

      {r.fala.confusoes.length > 0 && (
        <section>
          <h2>Pronúncia <small>o que o reconhecedor ouviu</small></h2>
          <ul className="prog-confusoes">
            {r.fala.confusoes.map((c) => <li key={c.en + c.ouvido}><b className="en">{c.en}</b> soou como “{c.ouvido}” <small>{c.vezes}x</small></li>)}
          </ul>
        </section>
      )}

      <section className="prog-duas">
        <div>
          <h2>Conversa</h2>
          <dl className="facts">
            <dt>Conversas</dt><dd>{r.chat.conversas}</dd>
            <dt>Mensagens suas</dt><dd>{r.chat.mensagens} ({r.chat.emIngles} em inglês)</dd>
            <dt>Correções recebidas</dt><dd>{r.chat.correcoes}</dd>
            <dt>Treinos concluídos</dt><dd>{r.chat.treinos}</dd>
            <dt>Palavras do vocabulário usadas</dt><dd>{r.chat.palavrasUsadas}</dd>
          </dl>
        </div>
        <div>
          <h2>Folhas e aulas</h2>
          <dl className="facts">
            <dt>Concluídas</dt><dd>{r.folhas.concluidas} ({r.folhas.escaneadas} escaneadas)</dd>
            <dt>Absorvidas</dt><dd>{r.folhas.absorvidas}</dd>
            <dt>Para revisar</dt><dd>{r.folhas.revisar}</dd>
            <dt>Para reforçar</dt><dd>{r.folhas.reforcar}</dd>
            <dt>Acerto nos exercícios</dt><dd>{pct(r.folhas.taxaExercicios)}</dd>
          </dl>
        </div>
      </section>

      <section>
        <h2>Frequência <small>{freq.porSemana} dias por semana</small></h2>
        <SketchLine valores={semanasEstudo.map((w) => w.dias)} />
        <div className="calor" role="img" aria-label={`${freq.diasEstudados} dias de estudo nas últimas 12 semanas`}>
          {ultimos.map((d) => (
            <i key={d.date} className={d.sessoes ? 'on' : ''} style={d.sessoes ? { opacity: Math.min(1, 0.45 + d.sessoes * 0.25) } : undefined}
              title={`${fmtShort(d.date)} (${weekdayShort(d.date)}): ${d.sessoes ? `${d.sessoes} sessão(ões), ${d.minutos} min` : 'sem estudo'}`} />
          ))}
        </div>
      </section>

      <section>
        <h2>Velocidade de aprendizado</h2>
        {ritmo.mediana === null ? (
          <Empty>Assim que uma palavra passar de nova a firme, o tempo aparece aqui.</Empty>
        ) : (
          <>
            <dl className="facts">
              <dt>Tempo típico</dt><dd>{ritmo.mediana} {ritmo.mediana === 1 ? 'dia' : 'dias'} do primeiro contato até firmar</dd>
              {ritmo.maisRapido && (<><dt>Mais rápido</dt><dd>{refLabel(ritmo.maisRapido.ref)} em {ritmo.maisRapido.dias} dias</dd></>)}
              {ritmo.maisLento && (<><dt>Mais demorado</dt><dd>{refLabel(ritmo.maisLento.ref)} em {ritmo.maisLento.dias} dias</dd></>)}
            </dl>
            <SketchDots valores={ritmo.concluidos.map((c) => c.dias)} />
          </>
        )}
      </section>
    </>
  );
}
