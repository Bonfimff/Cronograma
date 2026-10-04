import { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks';
import type { UserData } from '../../core/types';
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

/** Uma cor por faixa de minutos: nada, até 15, até 30, até 60, mais de 60. */
const NIVEIS = [0, 15, 30, 60];
const nivelDe = (min: number) => (min <= 0 ? 0 : NIVEIS.filter((n) => min > n).length);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Frequência como um calendário: cada coluna é uma semana (seg a dom, de cima para baixo),
 * cada quadrado um dia com o número do dia, mais escuro quanto mais minutos de estudo.
 */
function Calendario({ minutos }: { minutos: Record<string, number> }) {
  const SEMANAS = 12;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7) - 7 * (SEMANAS - 1));
  const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const colunas: { inicio: Date; dias: { d: Date; min: number; futuro: boolean }[] }[] = [];
  for (let s = 0; s < SEMANAS; s++) {
    const inicio = new Date(segunda);
    inicio.setDate(segunda.getDate() + s * 7);
    colunas.push({
      inicio,
      dias: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        return { d, min: minutos[chave(d)] ?? 0, futuro: d > hoje };
      }),
    });
  }
  const todos = colunas.flatMap((c) => c.dias).filter((x) => !x.futuro);
  const estudados = todos.filter((x) => x.min > 0);
  const total = estudados.reduce((s, x) => s + x.min, 0);
  const estaSemana = colunas[SEMANAS - 1].dias.filter((x) => x.min > 0).length;

  return (
    <>
      <h2>Frequência <small>últimas {SEMANAS} semanas</small></h2>
      <p className="calendario-resumo">
        <b>{estudados.length}</b> dias de estudo · <b>{(estudados.length / SEMANAS).toFixed(1).replace('.', ',')}</b> dias por semana em média ·
        {' '}<b>{estaSemana}</b> {estaSemana === 1 ? 'dia' : 'dias'} nesta semana · <b>{horas(total)}</b> no total
      </p>
      <div className="calendario" role="img" aria-label={`${estudados.length} dias de estudo nas últimas ${SEMANAS} semanas`}>
        <span />
        {colunas.map((c, i) => (
          <span key={i} className="calendario-mes">{i === 0 || c.inicio.getDate() <= 7 ? MESES[c.inicio.getMonth()] : ''}</span>
        ))}
        {DIAS.map((nome, linha) => (
          <span key={nome} style={{ display: 'contents' }}>
            <span className="calendario-dia">{nome}</span>
            {colunas.map((c) => {
              const x = c.dias[linha];
              return (
                <i key={chave(x.d)} className={`n${nivelDe(x.min)}${x.futuro ? ' futuro' : ''}`}
                  title={`${fmtShort(chave(x.d))} (${weekdayShort(chave(x.d))}): ${x.min ? `${x.min} min de estudo` : 'sem estudo'}`}>
                  {x.futuro ? '' : x.d.getDate()}
                </i>
              );
            })}
          </span>
        ))}
      </div>
      <p className="calendario-legenda">
        <span>Menos</span>
        {['sem estudo', 'até 15 min', 'até 30 min', 'até 1 h', 'mais de 1 h'].map((t, i) => <i key={t} className={`n${i}`} title={t} />)}
        <span>Mais</span>
      </p>
    </>
  );
}

/** O placar antigo do Tetris (antes do registro de atividades) entra no mesmo formato. */
function doTetris(stats: WordStats, melhores: boolean): PalavraPlacar[] {
  const lista = melhores ? bestWords(stats) : hardestWords(stats);
  return lista.map((w) => ({ en: w.en, acertos: w.certos, erros: w.errados, taxa: w.taxa, ultima: w.ultima ?? w.estreia ?? '' }));
}

/** Sem `dados`: o meu progresso. Com `dados`: o de um aluno, na tela do professor (só leitura). */
export function ProgressPage({ dados, aluno }: { dados?: UserData; aluno?: string } = {}) {
  const meus = useData();
  const data = dados ?? meus;
  const r = useMemo(() => relatorio(data), [data]);
  const stats = dados ? {} : loadStats();
  const freq = frequency(data);
  const ritmo = learningSpeed(data);
  const semanasEstudo = byWeek(freq);
  const ultimos = freq.dias.slice(-84);
  const [analise, setAnalise] = useState<Analise | null>(() => (dados ? null : analiseGuardada()));
  const [analisando, setAnalisando] = useState(false);

  // revisão diária: ao abrir a aba, se a análise não é de hoje, pede uma nova
  // (na tela do professor, a análise é a automática: a guardada é a deste aparelho)
  useEffect(() => {
    if (dados) return;
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
  const m = r.memoria;
  const tendencia = g.taxa7 !== null && g.taxaAnterior !== null ? (Math.round(g.taxa7 * 100) === Math.round(g.taxaAnterior * 100) ? '=' : g.taxa7 > g.taxaAnterior ? '↑' : '↓') + ` antes ${pct(g.taxaAnterior)}` : undefined;
  const semDados = !r.porTipo.length;

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Progresso</p>
        <h1>{aluno ? `Progresso de ${aluno}` : 'Meu progresso'} <CatTeacher className="cut-title" width="74" /></h1>
        <p className="lead">{aluno ? 'Visão do professor, só leitura: aulas, folhas, jogos, fala e conversa.' : 'Tudo o que você fez: aulas, folhas, jogos, fala e conversa.'}</p>
      </section>

      <section className="prog-cartoes">
        <Cartao icone="semana" titulo="Estudo (7 dias)" valor={horas(g.minutos7)} detalhe={`${horas(g.minutosTotal)} no total`} />
        <Cartao icone="chama" titulo="Sequência" valor={`${g.sequenciaAtual} ${g.sequenciaAtual === 1 ? 'dia' : 'dias'}`} detalhe={`melhor: ${g.melhorSequencia}`} />
        <Cartao icone="estrela" titulo="Acerto (7 dias)" valor={pct(g.taxa7)} detalhe={tendencia} />
        <Cartao icone="jogos" titulo="Atividades (7 dias)" valor={String(g.atividades7)} detalhe={`${g.diasEstudados30} dias nos últimos 30`} />
        <Cartao icone="conteudo" titulo="Palavras praticadas" valor={String(g.palavrasPraticadas)} detalhe={`${g.palavrasAprendidas} já firmes`} />
        <Cartao icone="microfone2" titulo="Fala" valor={pct(r.fala.taxa)} detalhe={`${r.fala.tentativas} tentativas`} />
        <Cartao icone="estrela" titulo="Lembra hoje" valor={String(m.lembradasHoje)} detalhe={m.retencaoMedia === null ? 'pratique para medir' : `retenção média ${pct(m.retencaoMedia)}`} />
        <Cartao icone="semana" titulo="Mês" valor={horas(r.mes.atual.minutos)} detalhe={`antes: ${horas(r.mes.anterior.minutos)} · ${r.mes.atual.dias} dias`} />
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
        {!dados && (
          <button type="button" className="ghost small" onClick={atualizar} disabled={analisando}>
            {analisando ? 'Analisando…' : 'Atualizar análise'}
          </button>
        )}
      </section>

      {(r.plano.revisar.length > 0 || r.plano.subir.length > 0) && (
        <section className="prog-duas">
          <div>
            <h2>Revise esta semana <small>quase esquecidas</small></h2>
            {r.plano.revisar.length ? (
              <ul className="prog-barras">
                {r.plano.revisar.map((p) => (
                  <li key={p.en}><b className="en">{p.en}</b><span className="barra"><i style={{ width: `${Math.round(p.retencao * 100)}%` }} /></span><small>{pct(p.retencao)}</small></li>
                ))}
              </ul>
            ) : <p className="muted">Nada perto de ser esquecido agora.</p>}
          </div>
          <div>
            <h2>Suba um degrau</h2>
            {r.plano.subir.length ? (
              <ul className="prog-confusoes">
                {r.plano.subir.map((p) => <li key={p.en}><b className="en">{p.en}</b>: agora, {p.proximo}</li>)}
              </ul>
            ) : <p className="muted">Firme algumas palavras para aparecerem aqui.</p>}
          </div>
        </section>
      )}

      <section>
        <h2>Memória e domínio <small>{m.estabilidadeMediana !== null && (m.estabilidadeMediana < 1 ? 'memórias ainda novas (menos de 1 dia)' : `cada palavra dura ~${Math.round(m.estabilidadeMediana)} dias`)}</small></h2>
        <p className="muted">
          A escada de saber uma palavra: reconhecer o sentido, lembrar sozinho, entender ouvindo, pronunciar e usar.
          A chance de lembrar cai com o tempo; cada revisão no momento certo faz a memória durar mais.
        </p>
        <ul className="prog-barras">
          {m.escada.map((d) => (
            <li key={d.rotulo}><span>{d.rotulo}</span><span className="barra"><i style={{ width: `${Math.round((d.quantas / Math.max(1, m.escada[0].quantas)) * 100)}%` }} /></span><small>{d.quantas}</small></li>
          ))}
        </ul>
        {m.habilidades.some((h) => h.respostas) && (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Habilidade</th><th className="num">Nível</th><th className="num">Respostas</th><th className="num">Acerto</th><th className="num">Tempo</th></tr></thead>
              <tbody>
                {m.habilidades.filter((h) => h.respostas).map((h) => {
                  const antes = h.historico[0];
                  return (
                    <tr key={h.hab}>
                      <td>{h.rotulo}</td>
                      <td className="num">{h.nivel}{antes !== undefined && h.nivel !== antes ? ` ${h.nivel > antes ? '↑' : '↓'}` : ''}</td>
                      <td className="num">{h.respostas}</td>
                      <td className="num">{pct(h.taxa)}</td>
                      <td className="num">{h.segundos === null ? '—' : `${h.segundos}s`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
            {m.retencaoPorFaixa.some((f) => f.testes >= 5) && (
              <>
                <p className="muted">O que você lembrou no dia seguinte, pelo horário em que estudou</p>
                <dl className="facts">
                  {m.retencaoPorFaixa.filter((f) => f.testes >= 5).map((f) => (
                    <span key={f.nome} style={{ display: 'contents' }}>
                      <dt>{f.nome}</dt><dd>{pct(f.taxa)} <small>({f.testes} testes)</small></dd>
                    </span>
                  ))}
                </dl>
              </>
            )}
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
          {r.fala.padroes.length > 0 && (
            <ul className="prog-barras">
              {r.fala.padroes.map((p) => (
                <li key={p.padrao}><span>{p.nome}</span><span className="barra"><i style={{ width: `${Math.round((p.vezes / r.fala.padroes[0].vezes) * 100)}%` }} /></span><small>{p.vezes}x · {p.exemplos.join(', ')}</small></li>
              ))}
            </ul>
          )}
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
            <dt>Palavras do vocabulário nas respostas</dt><dd>{r.chat.palavrasUsadas}</dd>
            <dt>Palavras por mensagem em inglês</dt><dd>{r.chat.palavrasPorMensagem ?? '—'}</dd>
            <dt>Palavras diferentes que você escreveu</dt><dd>{r.chat.variedade}</dd>
            <dt>Do seu vocabulário, usadas por você</dt><dd>{r.chat.vocabularioProprio}</dd>
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
        <Calendario minutos={r.minutosPorDia} />
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
