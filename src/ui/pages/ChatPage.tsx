import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, api, type GlossaryItem } from '../../core/api/client';
import { session } from '../../core/api/session';
import { acrescentar, apagarConversa, lerConversa, paraOModelo } from '../../core/chat/conversa';
import { recortar } from '../../core/chat/marcas';
import { lerFala, pararLeitura } from '../../core/chat/leitura';
import { useData } from '../hooks';
import { falar as falarVoz } from '../../core/lessons/vozes';
import { ditadoDisponivel, ditar, type Ditado } from '../../core/speech/ditado';
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
          {ficha && <a href={`#/conteudo/word:${ficha.split(':')[1]}`}>ver ficha</a>}
        </span>
      )}
    </span>
  );
}

function Fala({ turno }: { turno: ChatTurn }) {
  const glossario = new Map((turno.glossary ?? []).map((g: GlossaryItem) => [g.en.toLowerCase(), g]));
  const pedacos = recortar(turno.content);

  return (
    <div className={`conversa-fala ${turno.role}`}>
      <p>
        {pedacos.map((p, i) => {
          if (!p.palavra) return <span key={i}>{p.texto}</span>;
          const g = glossario.get(p.texto.toLowerCase());
          return <Palavra key={i} texto={p.texto} pt={g?.pt} ficha={g?.id} />;
        })}
      </p>
      <button className="conversa-ouvir" onClick={() => lerFala(turno.content)} aria-label="Ouvir a mensagem">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4z" strokeLinejoin="round" />
          <path d="M15.6 9.2a4 4 0 0 1 0 5.6" strokeLinecap="round" />
        </svg>
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
  useData(); // redesenha quando a conversa muda, inclusive vinda de outro aparelho
  const falas = lerConversa();
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
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

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [falas.length, pensando]);

  const enviar = async (conteudo: string) => {
    const limpo = conteudo.trim();
    if (!limpo || pensando) return;
    pararDitado();
    acrescentar({ role: 'user', content: limpo });
    setTexto('');
    setErro('');
    setPensando(true);
    try {
      const r = await session.withToken((t) => api.chat(t, paraOModelo(lerConversa())));
      acrescentar({ role: 'assistant', content: r.reply, glossary: r.glossary });
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível falar com o amigo de treino.');
    } finally {
      setPensando(false);
    }
  };

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
        {falas.length > 0 && (
          <button
            className="conversa-apagar"
            onClick={() => confirm('Apagar todas as mensagens? Elas somem também nos outros aparelhos.') && (pararLeitura(), apagarConversa())}
          >
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
        {pensando && <div className="conversa-fala assistant pensando"><span /><span /><span /></div>}
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
          placeholder={ouvindo ? 'Pode falar…' : 'Escreva ou toque no microfone'}
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
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
        )}
        <button className="primary" type="submit" disabled={pensando || !texto.trim()}>Enviar</button>
      </form>

    </div>
  );
}
