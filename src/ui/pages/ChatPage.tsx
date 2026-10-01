import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, api, type ChatMessage } from '../../core/api/client';
import { session } from '../../core/api/session';
import { guardarConversa, lerConversa, recorte } from '../../core/chat/conversa';
import { prepararFala } from '../../core/lessons/vozes';

/** Alto-falante: lê a fala em inglês, com a voz escolhida nos Ajustes. */
function Ouvir({ texto }: { texto: string }) {
  const ler = () => {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(prepararFala(texto, 'en'));
  };
  return (
    <button className="conversa-ouvir" onClick={ler} aria-label="Ouvir">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4z" strokeLinejoin="round" />
        <path d="M15.6 9.2a4 4 0 0 1 0 5.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

const SUGESTOES = [
  'Tell me about your week.',
  'Can you correct this sentence for me?',
  'Give me three words to practice today.',
];

/**
 * Conversa em inglês com o modelo que roda no computador de casa. O servidor é
 * só o caminho: se o computador estiver desligado, a resposta não vem, e a tela
 * avisa em vez de ficar girando.
 */
export function ChatPage() {
  const estado = useSyncExternalStore((cb) => session.subscribe(cb), () => session.get());
  const [falas, setFalas] = useState<ChatMessage[]>(lerConversa);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { guardarConversa(falas); }, [falas]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [falas, pensando]);

  const enviar = async (conteudo: string) => {
    const limpo = conteudo.trim();
    if (!limpo || pensando) return;
    const comigo = [...falas, { role: 'user', content: limpo } as ChatMessage];
    setFalas(comigo);
    setTexto('');
    setErro('');
    setPensando(true);
    try {
      const r = await session.withToken((t) => api.chat(t, recorte(comigo)));
      setFalas([...comigo, { role: 'assistant', content: r.reply }]);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível falar com o modelo.');
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
          A conversa acontece no servidor, então ela precisa da sua conta. <a href="#/conta">Entrar</a>
        </p>
      </section>
    );
  }

  return (
    <div className="conversa">
      <section className="hero conversa-topo">
        <p className="eyebrow">Conversa</p>
        <h1>Practice English</h1>
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
        {falas.map((m, i) => (
          <div key={i} className={`conversa-fala ${m.role}`}>
            <p>{m.content}</p>
            {m.role === 'assistant' && <Ouvir texto={m.content} />}
          </div>
        ))}
        {pensando && <div className="conversa-fala assistant pensando"><span /><span /><span /></div>}
        {erro && <p className="aviso">{erro}</p>}
        <div ref={fim} />
      </div>

      <form
        className="conversa-escrever"
        onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); }
          }}
          placeholder="Write in English"
          rows={1}
        />
        <button className="primary" type="submit" disabled={pensando || !texto.trim()}>Enviar</button>
      </form>

      {falas.length > 0 && (
        <p className="conversa-limpar">
          <button className="link" onClick={() => confirm('Começar uma conversa nova?') && setFalas([])}>
            Nova conversa
          </button>
        </p>
      )}
    </div>
  );
}
