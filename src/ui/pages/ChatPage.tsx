import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, api, type GlossaryItem } from '../../core/api/client';
import { session } from '../../core/api/session';
import { acrescentar, apagarConversa, lerConversa, paraOModelo } from '../../core/chat/conversa';
import { recortar, semMarcas } from '../../core/chat/marcas';
import { useData } from '../hooks';
import { prepararFala } from '../../core/lessons/vozes';
import type { ChatTurn } from '../../core/types';

const falar = (texto: string) => {
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(prepararFala(texto, 'en'));
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

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [falas.length, pensando]);

  const enviar = async (conteudo: string) => {
    const limpo = conteudo.trim();
    if (!limpo || pensando) return;
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
          placeholder="Escreva aqui"
          rows={1}
        />
        <button className="primary" type="submit" disabled={pensando || !texto.trim()}>Enviar</button>
      </form>

      {falas.length > 0 && (
        <p className="conversa-limpar">
          <button
            className="link"
            onClick={() => confirm('Apagar o histórico da conversa? Ele some também nos outros aparelhos.') && apagarConversa()}
          >
            Apagar histórico
          </button>
          <button className="link" onClick={() => falar(semMarcas(falas[falas.length - 1].content))}>
            Ouvir a última
          </button>
        </p>
      )}
    </div>
  );
}
