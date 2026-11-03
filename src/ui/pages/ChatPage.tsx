import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { focoDeEstudo, palavrasDoFoco } from '../../core/estudo/foco';
import { ApiError, api, type GlossaryItem } from '../../core/api/client';
import { session } from '../../core/api/session';
import { acrescentar, apagarConversa, apagarFala, lerConversa, paraOModelo } from '../../core/chat/conversa';
import { recortar, semMarcas } from '../../core/chat/marcas';
import { leituraAutomatica, lerFala, pararLeitura } from '../../core/chat/leitura';
import { go, useData, useRoute } from '../hooks';
import { acordarAudio, ajustesVoz, falaAtual, falar as falarVoz, type Lingua } from '../../core/lessons/vozes';
import { ditadoDisponivel, ditar, type Ditado } from '../../core/speech/ditado';
import { IconeKit } from '../components/Doodles';
import { ModoVoz } from '../components/ModoVoz';
import { vibrar } from '../../core/vibrar';
import type { ChatTurn } from '../../core/types';

const falar = (texto: string) => {
  void falarVoz({ texto, lingua: 'en' });
};

/**
 * Palavra viva: sublinhada com pontinhos, toca a pronúncia e abre a tradução.
 * O primeiro toque fala e mostra o balão; tocar de novo fecha.
 */
function Palavra({ texto, pt, ficha }: { texto: string; pt?: string; ficha?: string }) {
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    const fechar = () => setAberta(false);
    document.addEventListener('pointerdown', fechar);
    return () => document.removeEventListener('pointerdown', fechar);
  }, [aberta]);

  return (
    <span className="viva">
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => { falar(texto); setAberta((a) => !a); }}
      >
        {texto}
      </button>
      {aberta && pt && (
        <span className="viva-balao" role="tooltip">
          {pt}
          {ficha && <a href={`#/conteudo/${ficha.startsWith('expressions:') ? 'expression' : 'word'}:${ficha.split(':')[1]}`}>ver ficha</a>}
        </span>
      )}
    </span>
  );
}

const TEMPO_SEGURAR = 500;
/** quanto da fala citada fica guardado e vai para o modelo */
const TAMANHO_CITACAO = 300;
const QUEM: Record<ChatTurn['role'], string> = { user: 'Você', assistant: 'Amigo de treino' };

/** Segurar a fala abre as opções; rolar a tela cancela. O clique mais direito do mouse faz o mesmo. */
function useSegurar(aoSegurar: () => void) {
  const relogio = useRef(0);
  const inicio = useRef({ x: 0, y: 0 });
  const segurou = useRef(false);
  const soltar = () => window.clearTimeout(relogio.current);

  useEffect(() => soltar, []);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      segurou.current = false;
      inicio.current = { x: e.clientX, y: e.clientY };
      soltar();
      relogio.current = window.setTimeout(() => { segurou.current = true; aoSegurar(); }, TEMPO_SEGURAR);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - inicio.current.x, e.clientY - inicio.current.y) > 10) soltar();
    },
    onPointerUp: soltar,
    onPointerCancel: soltar,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); soltar(); segurou.current = true; aoSegurar(); },
    // soltar depois de segurar não vale como toque na palavra ou no alto-falante
    onClickCapture: (e: React.MouseEvent) => {
      if (segurou.current) { e.preventDefault(); e.stopPropagation(); segurou.current = false; }
    },
  };
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataEHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

function irParaFala(id: string) {
  const alvo = document.getElementById(`fala-${id}`);
  if (!alvo) return;
  alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
  alvo.classList.add('destaque');
  window.setTimeout(() => alvo.classList.remove('destaque'), 1500);
}

function Fala({ turno, selecionada, aoSegurar }: { turno: ChatTurn; selecionada: boolean; aoSegurar: (t: ChatTurn) => void }) {
  const glossario = new Map((turno.glossary ?? []).map((g: GlossaryItem) => [g.en.toLowerCase(), g]));
  const pedacos = recortar(turno.content);
  const tocando = useSyncExternalStore(falaAtual.subscribe, falaAtual.get) === turno.id;
  const segurar = useSegurar(() => { vibrar(15); aoSegurar(turno); });

  return (
    <div id={`fala-${turno.id}`} className={`conversa-fala ${turno.role}${selecionada ? ' selecionada' : ''}`} {...segurar}>
      {turno.citacao && (
        <button className="fala-citacao" onClick={() => irParaFala(turno.citacao!.id)}>
          <strong>{QUEM[turno.citacao.role]}</strong>
          <span>{turno.citacao.texto}</span>
        </button>
      )}
      <p>
        {pedacos.map((p, i) => {
          if (!p.palavra) return <span key={i}>{p.texto}</span>;
          const g = glossario.get(p.texto.toLowerCase());
          return <Palavra key={i} texto={p.texto} pt={g?.pt} ficha={g?.id} />;
        })}
      </p>
      <div className="fala-rodape">
        <button
          className={`conversa-ouvir${tocando ? ' tocando' : ''}`}
          onClick={() => (tocando ? pararLeitura() : lerFala(turno.content, turno.id))}
          aria-label={tocando ? 'Parar a leitura' : 'Ouvir a mensagem'}
          aria-pressed={tocando}
        >
          <IconeKit nome="ouvir" width={20} />
        </button>
        <time className="fala-hora" dateTime={turno.at}>{hora(turno.at)}</time>
      </div>
    </div>
  );
}

function DetalhesFala({ turno, aoFechar }: { turno: ChatTurn; aoFechar: () => void }) {
  const resposta = turno.role === 'assistant';
  const segundos = turno.inicio ? (new Date(turno.at).getTime() - new Date(turno.inicio).getTime()) / 1000 : null;

  return (
    <div className="fala-menu-fundo" onClick={aoFechar}>
      <div className="fala-menu fala-detalhes" role="dialog" aria-label="Detalhes da mensagem" onClick={(e) => e.stopPropagation()}>
        <h2>Detalhes</h2>
        <dl>
          {resposta ? (
            <>
              <dt>Começou a responder</dt>
              <dd>{turno.inicio ? dataEHora(turno.inicio) : 'Não registrado'}</dd>
              <dt>Terminou de responder</dt>
              <dd>{dataEHora(turno.at)}</dd>
              {segundos !== null && (
                <>
                  <dt>Duração</dt>
                  <dd>{segundos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</dd>
                </>
              )}
              <dt>Tokens</dt>
              <dd>
                {turno.tokens
                  ? `${turno.tokens.entrada + turno.tokens.saida} (${turno.tokens.entrada} lidos, ${turno.tokens.saida} escritos)`
                  : 'Não registrado'}
              </dd>
            </>
          ) : (
            <>
              <dt>Enviada</dt>
              <dd>{dataEHora(turno.at)}</dd>
            </>
          )}
        </dl>
        <button onClick={aoFechar}>Fechar</button>
      </div>
    </div>
  );
}

const SUGESTOES = ['Oi! Tudo bem?', 'Quer saber como foi meu dia?', 'Me conta uma novidade'];

const ROTULO_VOZ: Record<Lingua, string> = { pt: 'Fala em português', en: 'Fala em inglês' };

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** O que dá para fazer com uma fala depois de segurá-la. */
function MenuFala({ turno, aoFechar, aoResponder, aoDetalhes, aoRecado }: {
  turno: ChatTurn;
  aoFechar: () => void;
  aoResponder: () => void;
  aoDetalhes: () => void;
  aoRecado: (texto: string) => void;
}) {
  const texto = semMarcas(turno.content);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  const aoCopiar = async () => {
    aoFechar();
    aoRecado((await copiar(texto)) ? 'Mensagem copiada' : 'Não foi possível copiar');
  };

  const aoCompartilhar = async () => {
    aoFechar();
    if (!navigator.share) {
      aoRecado((await copiar(texto)) ? 'Sem opção de compartilhar aqui: mensagem copiada' : 'Não foi possível compartilhar');
      return;
    }
    // quem desiste na janela do aparelho não precisa de aviso
    try { await navigator.share({ text: texto }); } catch { /* cancelado */ }
  };

  const aoApagar = () => {
    aoFechar();
    if (!confirm('Apagar esta mensagem? Ela some também nos outros aparelhos.')) return;
    if (falaAtual.get() === turno.id) pararLeitura();
    apagarFala(turno.id);
  };

  return (
    <div className="fala-menu-fundo" onClick={aoFechar}>
      <div className="fala-menu" role="menu" aria-label="Opções da mensagem" onClick={(e) => e.stopPropagation()}>
        <button role="menuitem" onClick={aoResponder}>Responder</button>
        <button role="menuitem" onClick={aoCopiar}>Copiar</button>
        <button role="menuitem" onClick={aoCompartilhar}>Compartilhar</button>
        <button role="menuitem" onClick={aoDetalhes}>Detalhes</button>
        <button role="menuitem" className="fala-menu-apagar" onClick={aoApagar}>Apagar</button>
      </div>
    </div>
  );
}

/** Três pontinhos do cabeçalho: atalho para a velocidade dos Ajustes e a leitura automática. */
function MenuConversa({ aoLimpar }: { aoLimpar?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [automatica, setAutomatica] = useState(leituraAutomatica.get);
  const ajustes = useSyncExternalStore(ajustesVoz.subscribe, ajustesVoz.get);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('pointerdown', fechar);
    return () => document.removeEventListener('pointerdown', fechar);
  }, [aberto]);

  return (
    <div className="conversa-menu" ref={caixa}>
      <button
        className="usuario-bt conversa-menu-bt"
        onClick={() => setAberto((a) => !a)}
        aria-label="Ajustes da conversa"
        aria-expanded={aberto}
      >
        ⋮
      </button>
      {aberto && (
        <div className="conversa-menu-caixa">
          {(['pt', 'en'] as const).map((lingua) => (
            <label key={lingua} className="form-linha coluna">
              <span>{ROTULO_VOZ[lingua]}: {ajustes.velocidade[lingua].toFixed(2)}x</span>
              <input
                type="range" min="0.5" max="1.5" step="0.05"
                value={ajustes.velocidade[lingua]}
                onChange={(e) => ajustesVoz.guardar({ ...ajustes, velocidade: { ...ajustes.velocidade, [lingua]: Number(e.target.value) } })}
              />
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={automatica}
              onChange={(e) => {
                leituraAutomatica.guardar(e.target.checked);
                setAutomatica(e.target.checked);
                if (!e.target.checked) pararLeitura();
              }}
            />
            Ler as respostas automaticamente
          </label>
          {aoLimpar && (
            <button className="conversa-apagar" onClick={() => { setAberto(false); aoLimpar(); }}>
              <IconeKit nome="lixeira" width={18} />
              Limpar histórico
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Conversa com o amigo de treino. Ele fala português e vai encaixando as
 * palavras em inglês que você já estudou; tocar numa delas ouve a pronúncia e
 * mostra a tradução.
 *
 * Quem escolhe as palavras e marca o texto é o servidor, que tem o vocabulário
 * no banco. Aqui é só desenho, voz e a caixa de escrever.
 */
export function ChatPage() {
  const estado = useSyncExternalStore((cb) => session.subscribe(cb), () => session.get());
  const data = useData(); // redesenha quando a conversa muda, inclusive vinda de outro aparelho
  const falas = lerConversa();
  const route = useRoute();
  const focoParam = route.query.get('foco');
  // as palavras em foco (aula de hoje, quase esquecidas, ou o que o endereço pediu): calculadas ao
  // abrir a conversa, mostradas no topo e mandadas ao servidor a cada mensagem
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const foco = useMemo(() => (focoParam ? palavrasDoFoco(data, focoParam) : focoDeEstudo(data).palavras), [focoParam]);
  const jaEnviou = useRef(false);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  /** a resposta enquanto o modelo escreve (some quando chega a versão final) */
  const [parcial, setParcial] = useState('');
  const [erro, setErro] = useState('');
  const seguindo = useRef(true);
  const [selecionada, setSelecionada] = useState<ChatTurn | null>(null);
  const [respondendo, setRespondendo] = useState<ChatTurn | null>(null);
  const [detalhes, setDetalhes] = useState<ChatTurn | null>(null);
  const [recado, setRecado] = useState('');
  const [emVoz, setEmVoz] = useState(false);
  const caixaTexto = useRef<HTMLTextAreaElement>(null);
  const ditado = useRef<Ditado | null>(null);
  const [ouvindo, setOuvindo] = useState(false);

  useEffect(() => () => ditado.current?.parar(), []);

  const pararDitado = () => { ditado.current?.parar(); ditado.current = null; };

  /** Microfone: o que a pessoa fala vai aparecendo na caixa, depois do que já estava escrito. */
  const alternarDitado = () => {
    if (ditado.current) { pararDitado(); return; }
    setErro('');
    const antes = texto.trim() ? texto.trimEnd() + ' ' : '';
    try {
      ditado.current = ditar(
        'pt-BR',
        (falado) => setTexto(antes + falado),
        (problema) => { ditado.current = null; setOuvindo(false); if (problema) setErro(problema); },
      );
      setOuvindo(true);
    } catch {
      setErro('Este navegador não deixou usar o microfone.');
    }
  };

  // desce até o fim da página: a última fala fica logo acima da caixa de escrever, que é presa à tela
  useEffect(() => {
    if (!recado) return;
    const relogio = window.setTimeout(() => setRecado(''), 2500);
    return () => window.clearTimeout(relogio);
  }, [recado]);

  const descer = (behavior: ScrollBehavior) => window.scrollTo({ top: document.documentElement.scrollHeight, behavior });

  // quem subiu para reler não é puxado de volta enquanto o modelo escreve
  useEffect(() => {
    let antes = window.scrollY;
    const aoRolar = () => {
      const noFim = document.documentElement.scrollHeight - window.innerHeight - window.scrollY < 80;
      if (noFim) seguindo.current = true;
      else if (window.scrollY < antes) seguindo.current = false;
      antes = window.scrollY;
    };
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  useEffect(() => { seguindo.current = true; descer('smooth'); }, [falas.length, pensando]);
  useEffect(() => { if (parcial && seguindo.current) descer('auto'); }, [parcial]);

  const enviar = async (conteudo: string, { semLeitura = false } = {}): Promise<ChatTurn | null> => {
    const limpo = conteudo.trim();
    if (!limpo || pensando) return null;
    pararDitado();
    if (leituraAutomatica.get()) pararLeitura();
    acrescentar({
      role: 'user',
      content: limpo,
      ...(respondendo && { citacao: { id: respondendo.id, role: respondendo.role, texto: semMarcas(respondendo.content).slice(0, TAMANHO_CITACAO) } }),
    });
    setRespondendo(null);
    setTexto('');
    setErro('');
    setPensando(true);
    // resposta que chega de uma vez, sem passar pelo modelo, começa quando foi pedida
    const pedido = new Date().toISOString();
    let primeiraPalavra: string | undefined;
    try {
      const r = await session.withToken((t) => api.chatAoVivo(t, paraOModelo(lerConversa()), (p) => {
        primeiraPalavra ??= new Date().toISOString();
        setParcial(p);
      }, foco));
      const resposta = acrescentar({
        role: 'assistant',
        content: r.reply,
        glossary: r.glossary,
        inicio: primeiraPalavra ?? pedido,
        ...(r.tokens && { tokens: r.tokens }),
      });
      if (!semLeitura && leituraAutomatica.get()) lerFala(resposta.content, resposta.id);
      return resposta;
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível falar com o amigo de treino.');
      return null;
    } finally {
      setPensando(false);
      setParcial('');
    }
  };

  // ?enviar=…: outra tela abriu a conversa com um pedido pronto ("Vamos treinar uma conversa")
  useEffect(() => {
    const pedido = route.query.get('enviar');
    if (!pedido || jaEnviou.current || !estado.tokens) return;
    jaEnviou.current = true;
    go(focoParam ? `/conversa?foco=${encodeURIComponent(focoParam)}` : '/conversa');
    void enviar(pedido);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api.configured || !estado.tokens) {
    return (
      <section className="hero">
        <p className="eyebrow">Conversa</p>
        <h1>Entre na conta para conversar</h1>
        <p className="lead">
          O amigo de treino usa as palavras que você já estudou, e elas ficam na sua
          conta. <a href="#/conta">Entrar</a>
        </p>
      </section>
    );
  }

  return (
    <div className="conversa">
      <header className="conversa-barra">
        <h1>Amigo de treino</h1>
        <MenuConversa
          aoLimpar={falas.length > 0
            ? () => { if (confirm('Apagar todas as mensagens? Elas somem também nos outros aparelhos.')) { pararLeitura(); apagarConversa(); } }
            : undefined}
        />
      </header>
      {foco.length > 0 && (
        <p className="conversa-foco muted" title="O amigo dá preferência a estas palavras: a aula em foco e as que estão escapando">
          Em foco: {foco.slice(0, 6).join(', ')}{foco.length > 6 ? ` e mais ${foco.length - 6}` : ''}
        </p>
      )}

      <div className="conversa-fluxo">
        {!falas.length && (
          <div className="conversa-inicio">
            <p className="muted">Comece por uma destas, ou escreva o que quiser.</p>
            {SUGESTOES.map((s) => (
              <button key={s} className="conversa-sugestao" onClick={() => enviar(s)}>{s}</button>
            ))}
          </div>
        )}
        {falas.map((f) => <Fala key={f.id} turno={f} selecionada={selecionada?.id === f.id} aoSegurar={setSelecionada} />)}
        {pensando && (parcial
        ? (
          <div className="conversa-fala assistant escrevendo">
            <p>
              {recortar(parcial).map((p, i) => (p.palavra ? <span key={i} className="viva"><button tabIndex={-1}>{p.texto}</button></span> : <span key={i}>{p.texto}</span>))}
              <span className="cursor" />
            </p>
          </div>
        )
        : <div className="conversa-fala assistant pensando"><span /><span /><span /></div>)}
        {erro && <p className="aviso">{erro}</p>}
      </div>

      {selecionada && (
        <MenuFala
          turno={selecionada}
          aoFechar={() => setSelecionada(null)}
          aoResponder={() => { setRespondendo(selecionada); setSelecionada(null); caixaTexto.current?.focus(); }}
          aoDetalhes={() => { setDetalhes(selecionada); setSelecionada(null); }}
          aoRecado={setRecado}
        />
      )}
      {detalhes && <DetalhesFala turno={detalhes} aoFechar={() => setDetalhes(null)} />}
      {recado && <p className="conversa-recado" role="status">{recado}</p>}
      {emVoz && (
        <ModoVoz
          aoFechar={() => setEmVoz(false)}
          aoFalar={(falado) => enviar(falado, { semLeitura: true })}
          escrevendo={parcial}
        />
      )}

      <form className="conversa-escrever" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
        {respondendo && (
          <div className="conversa-respondendo">
            <div>
              <strong>{QUEM[respondendo.role]}</strong>
              <span>{semMarcas(respondendo.content)}</span>
            </div>
            <button type="button" onClick={() => setRespondendo(null)} aria-label="Cancelar a resposta">✕</button>
          </div>
        )}
        <textarea
          ref={caixaTexto}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); }
          }}
          placeholder={ouvindo ? 'Pode falar…' : (ditadoDisponivel ? 'Escreva ou fale…' : 'Escreva aqui')}
          rows={1}
        />
        {ditadoDisponivel && (
          <button
            type="button"
            className={`conversa-mic${ouvindo ? ' ouvindo' : ''}`}
            onClick={alternarDitado}
            aria-label={ouvindo ? 'Parar de ouvir' : 'Falar a mensagem'}
            aria-pressed={ouvindo}
          >
            <IconeKit nome="microfone" width={28} />
          </button>
        )}
        {ditadoDisponivel && !texto.trim() ? (
          <button
            type="button"
            className="conversa-voz"
            aria-label="Conversar por voz"
            title="Conversar por voz"
            onClick={() => { acordarAudio(); pararDitado(); setEmVoz(true); }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M4 10v4M9 6v12M14 9v6M19 7v10" />
            </svg>
          </button>
        ) : (
          <button className="primary conversa-enviar" type="submit" aria-label="Enviar" title="Enviar" disabled={pensando || !texto.trim()}><IconeKit nome="enviar" width={26} /></button>
        )}
      </form>

    </div>
  );
}
