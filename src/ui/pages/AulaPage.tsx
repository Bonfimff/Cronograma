import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { go, useData } from '../hooks';
import { store } from '../../core/storage/store';
import { finishSession, findSession, saveExerciseScore, startSession, updateSession } from '../../core/sessions/sessions';
import {
  falasDaEtapa, guardarAutomatico, julgarFrase, lerAutomatico, montarAula,
  type Etapa, type EtapaConceito, type EtapaEscuta, type EtapaFala, type EtapaFechamento,
  type EtapaMissao, type EtapaPalavra, type FraseJulgada, type Modo,
} from '../../core/lessons/aula';
import { falaAtual, falar, pararFala, type Parte } from '../../core/lessons/vozes';
import { refLabel } from '../../core/content/repository';
import { Mic } from '../../core/speech/mic';
import { prepare, transcribe } from '../../core/speech/transcriber';
import type { Example } from '../../core/types';
import { Empty } from '../components/common';
import { ExerciseView } from '../components/ExerciseView';
import { FinishForm } from '../components/FinishForm';
import { IconeKit } from '../components/Doodles';

/**
 * A aula em cartões (ver core/lessons/aula.ts): um cartão por tela, cada um com
 * "Ouvir este passo", que lê tudo destacando o trecho que está tocando. Serve aos
 * dois modos: estudo (com exercícios, microfone e registro) e leitura (só conteúdo).
 */

/** O texto que está sendo lido agora, para o destaque. */
let lendoAgora: string | null = null;
const ouvintesLendo = new Set<() => void>();
const lendo = {
  get: () => lendoAgora,
  set(t: string | null) { lendoAgora = t; ouvintesLendo.forEach((o) => o()); },
  subscribe(o: () => void) { ouvintesLendo.add(o); return () => { ouvintesLendo.delete(o); }; },
};

function T({ t, className = '', children }: { t: string; className?: string; children?: ReactNode }) {
  const atual = useSyncExternalStore(lendo.subscribe, lendo.get);
  return <span className={`${className}${atual === t ? ' lendo' : ''}`}>{children ?? t}</span>;
}

const tocar = (partes: Parte[], chave: string, fator = 1) =>
  falar(partes, fator, chave, { aoParte: (p) => lendo.set(p?.texto ?? null) });

/** Botão de ouvir com o alto-falante do kit, animado enquanto toca. */
function Ouvir({ partes, chave, rotulo = 'Ouvir', lento = false }: { partes: Parte[]; chave: string; rotulo?: string; lento?: boolean }) {
  const atual = useSyncExternalStore(falaAtual.subscribe, falaAtual.get);
  const tocando = atual === chave;
  return (
    <button
      type="button"
      className={`aula-ouvir${lento ? ' lento' : ''}${tocando ? ' tocando' : ''}`}
      onClick={() => (tocando ? pararFala() : void tocar(partes, chave, lento ? 0.7 : 1))}
      aria-label={tocando ? 'Parar' : rotulo}
      title={rotulo}
    >
      {lento ? <span aria-hidden>🐢</span> : <IconeKit nome="ouvir" width={22} />}
    </button>
  );
}

/** Frase em inglês com ouvir e ouvir devagar, e a tradução embaixo. */
function Frase({ ex, chave, grande = false }: { ex: { en: string; pt?: string; context?: string }; chave: string; grande?: boolean }) {
  const partes: Parte[] = [{ texto: ex.en, lingua: 'en' }];
  return (
    <div className={`aula-frase${grande ? ' grande' : ''}`}>
      <p className="aula-en">
        <T t={ex.en} />
        <span className="aula-botoes">
          <Ouvir partes={partes} chave={`${chave}:n`} />
          <Ouvir partes={partes} chave={`${chave}:l`} rotulo="Ouvir devagar" lento />
        </span>
      </p>
      {ex.pt && <p className="aula-pt"><T t={ex.pt} /></p>}
      {ex.context && <p className="aula-ctx">{ex.context}</p>}
    </div>
  );
}

// ---------- microfone ----------

type ObterMic = (aviso: (m: string) => void) => Promise<Mic>;

const VEREDITO: Record<string, string> = {
  ok: 'Muito bem!',
  close: 'Quase lá! Ouça de novo e repita.',
  bad: 'Ainda não. Ouça o modelo e tente outra vez.',
  unclear: 'Não entendi. Fale um pouco mais perto do microfone.',
};

function erroDoMic(e: unknown): string {
  const nome = (e as Error)?.name;
  if (nome === 'NotAllowedError') return 'O microfone foi bloqueado. Permita o acesso nas configurações do navegador.';
  if (nome === 'NotFoundError') return 'Nenhum microfone encontrado.';
  return `Não consegui usar o microfone: ${(e as Error)?.message ?? e}`;
}

function Repetir({ alvo, obterMic, onResultado, rotulo = 'Repetir' }: {
  alvo: string; obterMic: ObterMic; onResultado?: (ok: boolean) => void; rotulo?: string;
}) {
  const [estado, setEstado] = useState<'parado' | 'preparando' | 'ouvindo' | 'julgando'>('parado');
  const [aviso, setAviso] = useState('');
  const [res, setRes] = useState<FraseJulgada | null>(null);
  const barra = useRef<HTMLSpanElement>(null);
  const cancelar = useRef<() => void>(() => {});
  useEffect(() => () => cancelar.current(), []);

  const tentar = async () => {
    if (estado === 'ouvindo') { cancelar.current(); setEstado('parado'); return; }
    if (estado !== 'parado') return;
    pararFala();
    setRes(null);
    setAviso('');
    try {
      setEstado('preparando');
      const mic = await obterMic(setAviso);
      setAviso('');
      setEstado('ouvindo');
      const l = mic.listen({
        waitMs: 7000, maxMs: 9000,
        onLevel: (v) => { if (barra.current) barra.current.style.transform = `scaleX(${v})`; },
      });
      cancelar.current = l.cancel;
      const got = await l.result;
      if (barra.current) barra.current.style.transform = 'scaleX(0)';
      if (got.kind === 'cancelled') return;
      if (got.kind === 'silence') { setEstado('parado'); setAviso('Não ouvi nada. Toque no microfone e fale.'); return; }
      setEstado('julgando');
      const j = julgarFrase(alvo, await transcribe(got.samples));
      setRes(j);
      setEstado('parado');
      if (j.verdict !== 'unclear') onResultado?.(j.verdict === 'ok' || j.verdict === 'close');
    } catch (e) {
      setEstado('parado');
      setAviso(erroDoMic(e));
    }
  };

  return (
    <div className="aula-repetir">
      <button type="button" className={`aula-mic ${estado}`} onClick={tentar} aria-label={estado === 'ouvindo' ? 'Parar de ouvir' : rotulo}>
        <IconeKit nome="microfone2" width={34} />
        <span>
          {estado === 'preparando' ? 'Preparando…' : estado === 'ouvindo' ? 'Ouvindo… fale agora' : estado === 'julgando' ? 'Conferindo…' : res ? 'Tentar de novo' : rotulo}
        </span>
      </button>
      {estado === 'ouvindo' && <span className="aula-nivel"><span ref={barra} /></span>}
      {aviso && <p className="aula-aviso">{aviso}</p>}
      {res && (
        <div className={`aula-resultado ${res.verdict}`}>
          <p className="aula-veredito">{VEREDITO[res.verdict]}</p>
          <p className="aula-palavras">
            {res.palavras.map((p, i) => <span key={i} className={p.ok ? 'ok' : 'falta'}>{p.texto}</span>)}
          </p>
          {res.ouvido && <p className="aula-ouvido">Ouvi: “{res.ouvido}”</p>}
        </div>
      )}
    </div>
  );
}

// ---------- cartões ----------

function CartaoPalavra({ e, obterMic, estudo }: { e: EtapaPalavra; obterMic: ObterMic; estudo: boolean }) {
  return (
    <>
      <p className="aula-classe">{e.classe}</p>
      <h2 className="aula-palavra">
        <T t={e.en} />
        <span className="aula-botoes">
          <Ouvir partes={[{ texto: e.en, lingua: 'en' }]} chave={`${e.id}:w`} />
          <Ouvir partes={[{ texto: e.en, lingua: 'en' }]} chave={`${e.id}:wl`} rotulo="Ouvir devagar" lento />
        </span>
      </h2>
      {(e.ipa || e.soletrado) && (
        <p className="aula-pron">
          {e.ipa && <span>{e.ipa}</span>}
          {e.soletrado && <span className="aula-soletrado">soa como “{e.soletrado}”</span>}
        </p>
      )}
      <p className="aula-traducao"><T t={e.traducoes.join(', ')} /></p>
      {e.significado && <p className="aula-texto"><T t={e.significado} /></p>}
      {e.exemplo && <Frase ex={e.exemplo} chave={`${e.id}:ex`} />}
      {estudo && <Repetir alvo={e.en} obterMic={obterMic} rotulo="Repita a palavra" />}
    </>
  );
}

function Formula({ formula }: { formula: string }) {
  const partes = formula.split(/\s*\+\s*/);
  return (
    <p className="aula-formula" aria-label={formula}>
      {partes.map((p, i) => (
        <span key={i} className="aula-bloco-wrap">
          {i > 0 && <span className="aula-mais">+</span>}
          <span className={`aula-bloco c${i % 5}`}>{p}</span>
        </span>
      ))}
    </p>
  );
}

function CartaoConceito({ e }: { e: EtapaConceito }) {
  return (
    <>
      <p className="aula-classe">{e.classe}</p>
      {e.tituloEmIngles ? (
        <h2 className="aula-palavra">
          <T t={e.titulo} />
          <span className="aula-botoes">
            <Ouvir partes={[{ texto: e.titulo, lingua: 'en' }]} chave={`${e.id}:t`} />
            <Ouvir partes={[{ texto: e.titulo, lingua: 'en' }]} chave={`${e.id}:tl`} rotulo="Ouvir devagar" lento />
          </span>
        </h2>
      ) : (
        <h2 className="aula-titulo"><T t={e.titulo} /></h2>
      )}
      {e.formula && <Formula formula={e.formula} />}
      {e.traducao && <p className="aula-traducao"><T t={e.traducao} /></p>}
      <p className="aula-texto"><T t={e.explicacao} /></p>
      {e.pontos.length > 0 && <ul className="aula-pontos">{e.pontos.map((p) => <li key={p}>{p}</li>)}</ul>}
      {e.exemplos.length > 0 && (
        <div className="aula-exemplos">
          <p className="aula-subtitulo">Exemplos</p>
          {e.exemplos.map((x) => <Frase key={x.id} ex={x} chave={`${e.id}:${x.id}`} />)}
        </div>
      )}
    </>
  );
}

function CartaoEscuta({ e, onResultado }: { e: EtapaEscuta; onResultado: (ok: boolean) => void }) {
  const [escolha, setEscolha] = useState<string | null>(null);
  const partes: Parte[] = [{ texto: e.exemplo.en, lingua: 'en' }];
  return (
    <>
      <h2 className="aula-titulo">Ouça e escolha o significado</h2>
      <div className="aula-escuta">
        <button type="button" className="aula-play" onClick={() => void tocar(partes, `${e.id}:p`)} aria-label="Tocar o áudio">
          <IconeKit nome="ouvir" width={44} />
          <span>Tocar</span>
        </button>
        <button type="button" className="aula-play lento" onClick={() => void tocar(partes, `${e.id}:pl`, 0.7)} aria-label="Tocar devagar">
          <span aria-hidden>🐢</span>
          <span>Devagar</span>
        </button>
      </div>
      <div className="aula-opcoes">
        {e.opcoes.map((o) => (
          <button
            key={o}
            type="button"
            disabled={escolha !== null}
            className={escolha === null ? '' : o === e.exemplo.pt ? 'certa' : o === escolha ? 'errada' : ''}
            onClick={() => { setEscolha(o); onResultado(o === e.exemplo.pt); }}
          >
            {o}
          </button>
        ))}
      </div>
      {escolha !== null && (
        <div className="aula-revela">
          <p className="aula-veredito">{escolha === e.exemplo.pt ? 'Isso!' : 'Era esta:'}</p>
          <Frase ex={e.exemplo} chave={`${e.id}:r`} />
        </div>
      )}
    </>
  );
}

function CartaoFala({ e, obterMic, onResultado }: { e: EtapaFala; obterMic: ObterMic; onResultado: (ok: boolean) => void }) {
  return (
    <>
      <h2 className="aula-titulo">Ouça e repita</h2>
      <p className="aula-dica">Ouça primeiro (devagar, se quiser). Depois toque no microfone e diga a frase inteira.</p>
      <Frase ex={e.alvo} chave={`${e.id}:a`} grande />
      <Repetir alvo={e.alvo.en} obterMic={obterMic} onResultado={onResultado} rotulo="Repetir a frase" />
    </>
  );
}

function Tarefa({ ex, n, total, obterMic, onFeita }: { ex: Example; n: number; total: number; obterMic: ObterMic; onFeita: (ok: boolean) => void }) {
  const [escrito, setEscrito] = useState('');
  const [res, setRes] = useState<FraseJulgada | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const conferir = () => {
    const j = julgarFrase(ex.en, escrito);
    setRes(j);
    setMostrar(true);
    onFeita(j.verdict === 'ok' || j.verdict === 'close');
  };
  return (
    <div className="aula-tarefa">
      <p className="aula-subtitulo">Tarefa {n} de {total}</p>
      <p className="aula-pedido">Diga em inglês: <strong><T t={ex.pt} /></strong></p>
      <Repetir alvo={ex.en} obterMic={obterMic} rotulo="Falar a resposta" onResultado={(ok) => { setMostrar(true); onFeita(ok); }} />
      <form className="aula-escrever" onSubmit={(ev) => { ev.preventDefault(); if (escrito.trim()) conferir(); }}>
        <input value={escrito} onChange={(ev) => setEscrito(ev.target.value)} placeholder="ou escreva aqui" autoCapitalize="off" autoComplete="off" spellCheck={false} />
        <button className="ghost small" disabled={!escrito.trim()}>Conferir</button>
      </form>
      {res && <p className={`aula-veredito ${res.verdict}`}>{VEREDITO[res.verdict]}</p>}
      {mostrar ? (
        <div className="aula-revela"><p className="aula-subtitulo">Um jeito de dizer</p><Frase ex={{ en: ex.en }} chave={`tarefa:${ex.id}`} /></div>
      ) : (
        <button type="button" className="link" onClick={() => setMostrar(true)}>Ver uma resposta</button>
      )}
    </div>
  );
}

function CartaoMissao({ e, obterMic, onResultado }: { e: EtapaMissao; obterMic: ObterMic; onResultado: (ok: boolean) => void }) {
  const [k, setK] = useState(0);
  const notas = useRef<boolean[]>([]);
  const feita = (ok: boolean) => {
    notas.current[k] = notas.current[k] || ok;
    if (k === e.tarefas.length - 1 || notas.current.length === e.tarefas.length) {
      onResultado(notas.current.filter(Boolean).length >= Math.ceil(e.tarefas.length / 2));
    }
  };
  return (
    <>
      <h2 className="aula-titulo">Agora é com você</h2>
      <p className="aula-situacao"><IconeKit nome="conversa" width={30} /><T t={e.situacao} /></p>
      <Tarefa key={k} ex={e.tarefas[k]} n={k + 1} total={e.tarefas.length} obterMic={obterMic} onFeita={feita} />
      {k < e.tarefas.length - 1 && (
        <div className="actions left"><button type="button" className="ghost small" onClick={() => setK(k + 1)}>Próxima tarefa ›</button></div>
      )}
    </>
  );
}

function CartaoFechamento({ e, modo, sessionId, placar }: { e: EtapaFechamento; modo: Modo; sessionId: string; placar: { total: number; certos: number } }) {
  const data = useData();
  const s = findSession(data, sessionId)!;
  return (
    <>
      <h2 className="aula-titulo">Leve com você</h2>
      {modo === 'estudo' && placar.total > 0 && (
        <p className="aula-placar"><IconeKit nome="estrela" width={28} /> Você acertou <strong>{placar.certos}</strong> de <strong>{placar.total}</strong> atividades.</p>
      )}
      {e.chaves.map((x) => <Frase key={x.id} ex={x} chave={`${e.id}:${x.id}`} />)}
      {e.copia.length > 0 && (
        <div className="copybox aula-copia">
          <p className="copy-mark">✎ Copie na folha</p>
          {e.copia.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
      {e.criterios.length > 0 && (
        <div className="aula-criterios">
          <p className="aula-subtitulo">Você consegue…</p>
          <ul>{e.criterios.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
      {e.extras.length > 0 && (
        <details className="aula-mais-conteudo">
          <summary>Saiba mais ({e.extras.length})</summary>
          <p className="atalhos">{e.extras.map((r) => <a key={r} href={`#/conteudo/${r}`}>{refLabel(r)}</a>)}</p>
        </details>
      )}
      {modo === 'estudo' ? (
        <div className="aula-registro">
          <p className="aula-subtitulo">Como foi?</p>
          <FinishForm
            session={s}
            source="manual"
            onSubmit={(r) => { store.update((d) => finishSession(d, sessionId, r)); go(`/sessao/${sessionId}`); }}
          />
          <p className="aula-dica">Usou a folha? Você também pode <a href={`#/scan?code=${sessionId}`}>escanear o verso</a>.</p>
        </div>
      ) : (
        <div className="actions left">
          <a className="primary" href={`#/aula/${sessionId}`}>Fazer a aula com exercícios</a>
          <a className="ghost" href={`#/sessao/${sessionId}`}>Voltar à sessão</a>
        </div>
      )}
    </>
  );
}

// ---------- o player ----------

const EXERCICIOS = new Set<Etapa['tipo']>(['aquecimento', 'pratica', 'escuta', 'fala', 'missao']);

export function AulaPage({ id, modo = 'estudo' }: { id: string; modo?: Modo }) {
  const data = useData();
  const s = findSession(data, id);
  const etapas = useMemo(() => (s ? montarAula(data, s, modo) : []), [s?.id, modo]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(() => (modo === 'estudo' && s && s.status !== 'done' ? Math.min(s.lessonStep ?? 0, Math.max(0, etapas.length - 1)) : 0));
  const [notas, setNotas] = useState<Record<string, boolean>>({});
  const [auto, setAuto] = useState(lerAutomatico);
  const tocando = useSyncExternalStore(falaAtual.subscribe, falaAtual.get);
  const mic = useRef<Mic>(new Mic());
  const transcritorPronto = useRef(false);

  useEffect(() => {
    if (modo === 'estudo' && s?.status === 'planned') store.update((d) => startSession(d, s.id));
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { pararFala(); lendo.set(null); mic.current.close(); }, []);

  if (!s || !etapas.length) return <Empty>Sessão não encontrada.</Empty>;
  const etapa = etapas[Math.min(i, etapas.length - 1)];

  const obterMic: ObterMic = async (aviso) => {
    const m = mic.current;
    if (!m.isOpen) {
      aviso('Pedindo acesso ao microfone…');
      await m.open();
      aviso('Fique em silêncio um instante…');
      await m.calibrate(700);
    }
    if (!transcritorPronto.current) {
      aviso('Preparando o reconhecedor de voz…');
      await prepare((f) => aviso(`Baixando o reconhecedor de voz… ${Math.round(f * 100)}%`));
      transcritorPronto.current = true;
    }
    return m;
  };

  const registrar = (etapaId: string) => (ok: boolean) => setNotas((n) => ({ ...n, [etapaId]: (n[etapaId] ?? false) || ok }));
  const placar = { total: Object.keys(notas).length, certos: Object.values(notas).filter(Boolean).length };

  const ouvirPasso = (e: Etapa) => void tocar(falasDaEtapa(e), e.id);

  const ir = (n: number) => {
    const destino = Math.max(0, Math.min(n, etapas.length - 1));
    pararFala();
    lendo.set(null);
    setI(destino);
    window.scrollTo(0, 0);
    if (modo === 'estudo') {
      store.update((d) => {
        updateSession(d, s.id, { lessonStep: destino });
        if (etapas[destino].tipo === 'fechamento') saveExerciseScore(d, s.id, placar.total, placar.certos);
      });
    }
    if (auto) ouvirPasso(etapas[destino]);
  };

  const alternarAuto = () => {
    const v = !auto;
    setAuto(v);
    guardarAutomatico(v);
    if (v) ouvirPasso(etapa); else pararFala();
  };

  const respondida = notas[etapa.id] !== undefined;
  const ultima = i >= etapas.length - 1;
  const lendoEste = tocando === etapa.id;

  return (
    <div className={`aula ${modo}`}>
      <header className="aula-topo">
        <div className="aula-topo-linha">
          <a href={`#/sessao/${s.id}`} className="back">‹ {s.title}</a>
          <span className="aula-contador">{i + 1} / {etapas.length}</span>
        </div>
        <ol className="aula-progresso" aria-label="Progresso da aula">
          {etapas.map((e, k) => (
            <li key={e.id} className={`t-${e.tipo}${k < i ? ' feito' : k === i ? ' atual' : ''}`} title={e.rotulo} />
          ))}
        </ol>
        <div className="aula-controles">
          <button type="button" className={`ghost small aula-ouvir-passo${lendoEste ? ' tocando' : ''}`} onClick={() => (lendoEste ? pararFala() : ouvirPasso(etapa))}>
            <IconeKit nome="ouvir" width={22} />{lendoEste ? 'Parar' : 'Ouvir este passo'}
          </button>
          <button type="button" className={`aula-auto${auto ? ' on' : ''}`} onClick={alternarAuto} aria-pressed={auto}>
            Ler sozinho {auto ? 'ligado' : 'desligado'}
          </button>
        </div>
      </header>

      <article key={etapa.id} className={`paper-card tape aula-cartao t-${etapa.tipo}`}>
        <span className="sticker aula-rotulo">{etapa.rotulo}</span>

        {etapa.tipo === 'abertura' && (
          <>
            <h1 className="aula-h1"><T t={etapa.titulo} /></h1>
            {etapa.situacao && <p className="aula-situacao"><IconeKit nome="conversa" width={30} /><T t={etapa.situacao} /></p>}
            <div className="aula-objetivo">
              <p className="aula-subtitulo">Ao final, você vai conseguir</p>
              <p><T t={etapa.objetivo} /></p>
            </div>
            {etapa.intro && <p className="aula-texto"><T t={etapa.intro} /></p>}
            {etapa.itens.length > 0 && (
              <>
                <p className="aula-subtitulo">Nesta aula</p>
                <p className="aula-itens">{etapa.itens.map((t) => <span key={t} className="aula-item">{t}</span>)}</p>
              </>
            )}
            <p className="aula-tempo">Cerca de {etapa.minutos} minutos{modo === 'leitura' ? ' de leitura' : ''}.</p>
            <div className="actions">
              <button type="button" className="primary big" onClick={() => ir(1)}>Começar</button>
            </div>
          </>
        )}
        {etapa.tipo === 'palavra' && <CartaoPalavra e={etapa} obterMic={obterMic} estudo={modo === 'estudo'} />}
        {etapa.tipo === 'conceito' && <CartaoConceito e={etapa} />}
        {(etapa.tipo === 'aquecimento' || etapa.tipo === 'pratica') && (
          <>
            {etapa.dica && <p className="aula-dica">{etapa.dica}</p>}
            <ExerciseView ex={etapa.exercicio} onResult={registrar(etapa.id)} />
          </>
        )}
        {etapa.tipo === 'escuta' && <CartaoEscuta e={etapa} onResultado={registrar(etapa.id)} />}
        {etapa.tipo === 'fala' && <CartaoFala e={etapa} obterMic={obterMic} onResultado={registrar(etapa.id)} />}
        {etapa.tipo === 'missao' && <CartaoMissao e={etapa} obterMic={obterMic} onResultado={registrar(etapa.id)} />}
        {etapa.tipo === 'fechamento' && <CartaoFechamento e={etapa} modo={modo} sessionId={s.id} placar={placar} />}
      </article>

      {etapa.tipo !== 'abertura' && (
        <nav className="aula-nav">
          <button type="button" className="ghost" onClick={() => ir(i - 1)}>‹ Voltar</button>
          {!ultima && (
            <button type="button" className="primary" onClick={() => ir(i + 1)}>
              {EXERCICIOS.has(etapa.tipo) && !respondida ? 'Pular' : 'Próximo'} ›
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
