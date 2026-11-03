import { useEffect, useRef, useState } from 'react';
import { lerFalaAteOFim, pararLeitura } from '../../core/chat/leitura';
import { semMarcas } from '../../core/chat/marcas';
import { ouvirFrase, type Ditado } from '../../core/speech/ditado';
import type { ChatTurn } from '../../core/types';

type Estado = 'ouvindo' | 'pensando' | 'falando' | 'pausado' | 'mudo';

const ROTULO: Record<Estado, string> = {
  ouvindo: 'Ouvindo…',
  pensando: 'Pensando…',
  falando: 'Toque na esfera para interromper',
  pausado: 'Toque na esfera para falar',
  mudo: 'Microfone desligado',
};

/** Depois de tantas escutas sem fala, para de abrir o microfone: cada abertura apita no Android. */
const ESCUTAS_VAZIAS = 3;

/**
 * Conversa contínua por voz: escuta, percebe que a pessoa parou de falar (o próprio
 * reconhecedor encerra no silêncio), responde em voz alta e volta a escutar.
 * O microfone fica fechado enquanto a voz fala, para ela não se ouvir.
 */
export function ModoVoz({ aoFechar, aoFalar, escrevendo }: {
  aoFechar: () => void;
  aoFalar: (texto: string) => Promise<ChatTurn | null>;
  /** a resposta enquanto o modelo escreve */
  escrevendo: string;
}) {
  const [estado, setEstado] = useState<Estado>('ouvindo');
  const [legenda, setLegenda] = useState('');
  const [recado, setRecado] = useState('');
  const [semMicrofone, setSemMicrofone] = useState(false);
  const aberto = useRef(true);
  const mudo = useRef(false);
  const escuta = useRef<Ditado | null>(null);
  const vazias = useRef(0);

  const ouvir = () => {
    if (!aberto.current || mudo.current) return;
    setEstado('ouvindo');
    setLegenda('');
    setRecado('');
    escuta.current = ouvirFrase('pt-BR', setLegenda, (texto, erro) => {
      escuta.current = null;
      if (!aberto.current || mudo.current) return;
      if (erro) {
        setEstado('pausado');
        setRecado(erro);
        return;
      }
      if (!texto.trim()) {
        vazias.current += 1;
        if (vazias.current >= ESCUTAS_VAZIAS) setEstado('pausado');
        else ouvir();
        return;
      }
      vazias.current = 0;
      void responder(texto);
    });
  };

  const responder = async (texto: string) => {
    setEstado('pensando');
    const resposta = await aoFalar(texto);
    if (!aberto.current) return;
    if (!resposta) {
      setEstado('pausado');
      setRecado('Não foi possível falar com o amigo de treino.');
      return;
    }
    setEstado('falando');
    setLegenda(semMarcas(resposta.content));
    await lerFalaAteOFim(resposta.content, resposta.id);
    if (aberto.current && !mudo.current) ouvir();
    else if (aberto.current) setEstado('mudo');
  };

  useEffect(() => {
    aberto.current = true;
    ouvir();
    // com a tela apagada o microfone para: mantém acesa enquanto a conversa durar
    let trava: { release: () => Promise<void> } | undefined;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    void nav.wakeLock?.request('screen').then((t) => { trava = t; }).catch(() => undefined);
    return () => {
      aberto.current = false;
      escuta.current?.cancelar?.();
      escuta.current = null;
      pararLeitura();
      void trava?.release().catch(() => undefined);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tocarEsfera = () => {
    if (estado === 'falando') pararLeitura(); // a leitura termina e o ciclo volta a escutar
    else if (estado === 'ouvindo') escuta.current?.parar(); // já terminei: pode responder
    else if (estado === 'pausado') { vazias.current = 0; ouvir(); }
  };

  const alternarMudo = () => {
    mudo.current = !mudo.current;
    setSemMicrofone(mudo.current);
    if (mudo.current) {
      escuta.current?.cancelar?.();
      escuta.current = null;
      if (estado !== 'falando' && estado !== 'pensando') setEstado('mudo');
    } else if (estado === 'mudo' || estado === 'pausado') {
      vazias.current = 0;
      ouvir();
    }
  };

  const texto = estado === 'pensando' ? semMarcas(escrevendo) : legenda;

  return (
    <div className="modo-voz" role="dialog" aria-label="Conversa por voz">
      <div className="modo-voz-centro">
        <button className={`modo-voz-esfera ${estado}`} onClick={tocarEsfera} aria-label={ROTULO[estado]}>
          <span className="modo-voz-nuvem" />
          <span className="modo-voz-nuvem segunda" />
        </button>
        <p className="modo-voz-rotulo" role="status">{recado || ROTULO[estado]}</p>
        <p className="modo-voz-legenda">{texto}</p>
      </div>
      <div className="modo-voz-botoes">
        <button
          className={`modo-voz-bt${semMicrofone ? ' desligado' : ''}`}
          onClick={alternarMudo}
          aria-label={semMicrofone ? 'Ligar o microfone' : 'Desligar o microfone'}
          aria-pressed={semMicrofone}
        >
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            {semMicrofone && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <button className="modo-voz-bt fechar" onClick={aoFechar} aria-label="Encerrar a conversa por voz">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
