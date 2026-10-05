import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { focoDeEstudo, palavrasDoFoco } from '../../core/estudo/foco';
import { ApiError, api, type GlossaryItem } from '../../core/api/client';
import { session } from '../../core/api/session';
import { acrescentar, apagarConversa, lerConversa, paraOModelo } from '../../core/chat/conversa';
import { recortar } from '../../core/chat/marcas';
import { lerFala, pararLeitura } from '../../core/chat/leitura';
import { go, useData, useRoute } from '../hooks';
import { falaAtual, falar as falarVoz } from '../../core/lessons/vozes';
import { ditadoDisponivel, ditar, type Ditado } from '../../core/speech/ditado';
import { IconeKit } from '../components/Doodles';
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

function Fala({ turno }: { turno: ChatTurn }) {
  const glossario = new Map((turno.glossary ?? []).map((g: GlossaryItem) => [g.en.toLowerCase(), g]));
  const pedacos = recortar(turno.content);
  const tocando = useSyncExternalStore(falaAtual.subscribe, falaAtual.get) === turno.id;

  return (
    <div className={`conversa-fala ${turno.role}`}>
      <p>
        {pedacos.map((p, i) => {
          if (!p.palavra) return <span key={i}>{p.texto}</span>;
          const g = glossario.get(p.texto.toLowerCase());
          return <Palavra key={i} texto={p.texto} pt={g?.pt} ficha={g?.id} />;
        })}
      </p>
      <button
        className={`conversa-ouvir${tocando ? ' tocando' : ''}`}
        onClick={() => (tocando ? pararLeitura() : lerFala(turno.content, turno.id))}
        aria-label={tocando ? 'Parar a leitura' : 'Ouvir a mensagem'}
        aria-pressed={tocando}
      >
        <IconeKit nome="ouvir" width={20} />
      </button>
    </div>
  );
}

const SUGESTOES = ['Oi! Tudo bem?', 'Quer saber como foi meu dia?', 'Me conta uma novidade'];

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
  const fim = useRef<HTMLDivElement>(null);
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

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [falas.length, pensando, parcial.length > 0]);

  const enviar = async (conteudo: string) => {
    const limpo = conteudo.trim();
    if (!limpo || pensando) return;
    pararDitado();
    acrescentar({ role: 'user', content: limpo });
    setTexto('');
    setErro('');
    setPensando(true);
    try {
      const r = await session.withToken((t) => api.chatAoVivo(t, paraOModelo(lerConversa()), setParcial, foco));
      acrescentar({ role: 'assistant', content: r.reply, glossary: r.glossary });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível falar com o amigo de treino.');
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
      <section className="hero conversa-topo">
        <p className="eyebrow">Conversa</p>
        <h1>Amigo de treino</h1>
        {foco.length > 0 && (
          <p className="conversa-foco muted" title="O amigo dá preferência a estas palavras: a aula em foco e as que estão escapando">
            Em foco: {foco.slice(0, 6).join(', ')}{foco.length > 6 ? ` e mais ${foco.length - 6}` : ''}
          </p>
        )}
        {falas.length > 0 && (
          <button
            className="conversa-apagar"
            onClick={() => confirm('Apagar todas as mensagens? Elas somem também nos outros aparelhos.') && (pararLeitura(), apagarConversa())}
          >
            <IconeKit nome="lixeira" width={18} />
            Limpar histórico
          </button>
        )}
      </section>

      <div className="conversa-fluxo">
        {!falas.length && (
          <div className="conversa-inicio">
            <p className="muted">Comece por uma destas, ou escreva o que quiser.</p>
            {SUGESTOES.map((s) => (
              <button key={s} className="conversa-sugestao" onClick={() => enviar(s)}>{s}</button>
            ))}
          </div>
        )}
        {falas.map((f) => <Fala key={f.id} turno={f} />)}
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
        <div ref={fim} />
      </div>

      <form className="conversa-escrever" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
        <textarea
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
        <button className="primary conversa-enviar" type="submit" aria-label="Enviar" title="Enviar" disabled={pensando || !texto.trim()}><IconeKit nome="enviar" width={26} /></button>
      </form>

    </div>
  );
}
