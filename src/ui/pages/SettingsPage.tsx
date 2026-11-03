import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ajustesVoz, falar, vozesDe, type AjustesVoz, type Lingua,
} from '../../core/lessons/vozes';
import {
  amostraBilingue, baixarBilingue, bilingueBaixada, desempenho, removerMotor, sintetizarBilingue, SOBRE_MOTOR, VOZES_BILINGUES, type MotorBilingue,
} from '../../core/speech/bilingue';
import {
  amostraDe, baixarVoz, PREFIXO_NATURAL, VOZES_NATURAIS, vozBaixada,
} from '../../core/speech/piper';
import { CatMegaphone } from '../components/Cutouts';
import { IconeKit } from '../components/Doodles';

/**
 * Ajustes da leitura em voz alta.
 *
 * Duas fontes de voz: as naturais (Piper), que rodam no navegador depois de baixadas
 * uma vez, e as do próprio aparelho. Cada voz natural tem uma amostra para ouvir antes
 * de escolher. A escolha vale para o app inteiro e fica no aparelho.
 *
 * A lista de vozes do navegador costuma chegar vazia no primeiro instante e só
 * depois é preenchida, então a tela ouve o aviso `voiceschanged` para refazer a lista.
 */

const EXEMPLO: Record<Lingua, string> = {
  en: 'How are you today?',
  pt: 'Assim é que a frase soa em português.',
};

const NOME_LINGUA: Record<Lingua, string> = { en: 'Inglês', pt: 'Português' };

const EXEMPLO_MISTO: { texto: string; lingua: Lingua }[] = [
  { texto: 'Então é ', lingua: 'pt' }, { texto: 'good', lingua: 'en' },
  { texto: ' praticar um pouco de ', lingua: 'pt' }, { texto: 'English', lingua: 'en' },
  { texto: ' todo dia.', lingua: 'pt' },
];

/** O que a medida significa para quem está lendo. */
function textoDesempenho(x: number | undefined): string {
  if (!x) return 'Velocidade neste aparelho: aparece depois de usar.';
  const n = x.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return x >= 1
    ? `Neste aparelho: gera ${n}x mais rápido que a fala.`
    : `Neste aparelho: gera a ${n}x da velocidade da fala, então pode haver esperas.`;
}

export function SettingsPage() {
  const ajustes = useSyncExternalStore((cb) => ajustesVoz.subscribe(cb), () => ajustesVoz.get());
  const [versao, setVersao] = useState(0); // muda quando o navegador termina de carregar as vozes
  const [baixadas, setBaixadas] = useState<Set<string>>(new Set());
  const [baixando, setBaixando] = useState<{ id: string; fracao: number } | null>(null);
  const [erro, setErro] = useState('');
  const amostra = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState('');

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const aviso = () => setVersao((v) => v + 1);
    speechSynthesis.addEventListener('voiceschanged', aviso);
    speechSynthesis.getVoices(); // acorda a lista em alguns navegadores
    return () => speechSynthesis.removeEventListener('voiceschanged', aviso);
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all(VOZES_NATURAIS.map(async (v) => ((await vozBaixada(v.id)) ? v.id : ''))).then((ids) => {
      if (vivo) setBaixadas(new Set(ids.filter(Boolean)));
    });
    return () => { vivo = false; amostra.current?.pause(); };
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all(VOZES_BILINGUES.map(async (v) => ((await bilingueBaixada(v.id)) ? v.id : ''))).then((ids) => {
      if (vivo) setBaixadas((b) => new Set([...b, ...ids.filter(Boolean)]));
    });
    return () => { vivo = false; };
  }, []);

  const mudar = (p: Partial<AjustesVoz>) => ajustesVoz.guardar({ ...ajustesVoz.get(), ...p });

  const ouvirAmostra = (url: string, id: string) => {
    amostra.current?.pause();
    if (tocando === id) { setTocando(''); return; }
    const a = new Audio(url);
    a.onended = () => setTocando('');
    amostra.current = a;
    setTocando(id);
    a.play().catch(() => setTocando(''));
  };

  const escolher = async (lingua: Lingua, id: string) => {
    setErro('');
    if (!baixadas.has(id)) {
      setBaixando({ id, fracao: 0 });
      try {
        await baixarVoz(id, (f) => setBaixando({ id, fracao: f }));
        setBaixadas((b) => new Set(b).add(id));
      } catch (e) {
        setErro(`Não consegui baixar a voz: ${(e as Error)?.message ?? e}. Confira a internet e tente de novo.`);
        setBaixando(null);
        return;
      }
      setBaixando(null);
    }
    mudar({ voz: { ...ajustesVoz.get().voz, [lingua]: PREFIXO_NATURAL + id } });
    void falar({ texto: EXEMPLO[lingua], lingua });
  };

  const escolherBilingue = async (id: string) => {
    setErro('');
    if (!baixadas.has(id)) {
      setBaixando({ id, fracao: 0 });
      try {
        await baixarBilingue(id, (f) => setBaixando({ id, fracao: f }));
        setBaixadas((b) => new Set(b).add(id));
      } catch (e) {
        setErro(`Não consegui baixar a voz: ${(e as Error)?.message ?? e}. Confira a internet e o espaço livre, e tente de novo.`);
        setBaixando(null);
        return;
      }
      setBaixando(null);
    }
    mudar({ bilingue: id });
    await falar(EXEMPLO_MISTO);
    await sintetizarBilingue(id, EXEMPLO_MISTO, 1).catch(() => null); // mede com a voz já pronta
    setVersao((v) => v + 1); // mostra a velocidade que acabou de ser medida
  };

  const removerBilingue = async (motor: MotorBilingue) => {
    if (!confirm(`Apagar o modelo ${SOBRE_MOTOR[motor].titulo} deste aparelho? Para usar de novo, será preciso baixar.`)) return;
    if (ajustes.bilingue.startsWith(`${motor}:`)) mudar({ bilingue: '' });
    await removerMotor(motor);
    setBaixadas((b) => new Set([...b].filter((id) => !id.startsWith(`${motor}:`))));
  };

  const blocoBilingue = () => {
    const medidas = desempenho();
    return (
      <section key={`bilingue-${versao}`}>
        <h2>Vozes bilíngues</h2>
        <p className="muted small-text">
          Vozes masculinas que leem português e inglês sem trocar de voz no meio da frase. Enquanto uma
          delas estiver em uso, ela substitui as vozes abaixo. Ouça, compare o peso e a velocidade, e escolha.
        </p>
        {ajustes.bilingue && (
          <div className="actions left">
            <button className="ghost small" onClick={() => mudar({ bilingue: '' })}>Voltar às vozes separadas</button>
          </div>
        )}
        {(['supertonic', 'kokoro'] as const).map((motor) => {
          const vozes = VOZES_BILINGUES.filter((v) => v.motor === motor);
          const sobre = SOBRE_MOTOR[motor];
          // o modelo é o mesmo para as vozes do motor: trocar de voz baixa só um arquivo pequeno
          const temModelo = vozes.some((v) => baixadas.has(v.id));
          return (
            <div key={motor}>
              <h3>{sobre.titulo} <span className="muted small-text">({sobre.peso})</span></h3>
              <p className="muted small-text">{sobre.texto} {textoDesempenho(medidas[motor])}</p>
              <ul className="vozes-lista">
                {vozes.map((v) => {
                  const emUso = ajustes.bilingue === v.id;
                  const carregando = baixando?.id === v.id;
                  return (
                    <li key={v.id} className={`voz-item${emUso ? ' em-uso' : ''}`}>
                      <button
                        className="ghost small voz-ouvir"
                        onClick={() => ouvirAmostra(amostraBilingue(v.id), v.id)}
                        aria-label={tocando === v.id ? `Parar amostra de ${v.nome}` : `Ouvir ${v.nome}`}
                      >
                        {tocando === v.id ? '■' : <IconeKit nome="ouvir" width={24} />}
                      </button>
                      <span className="voz-nome"><strong>{v.nome}</strong></span>
                      {emUso ? (
                        <span className="voz-uso">Em uso</span>
                      ) : (
                        <button className="primary small voz-baixar" disabled={!!baixando} onClick={() => escolherBilingue(v.id)}>
                          {!carregando && !temModelo && <IconeKit nome="baixar" width={20} />}
                          {carregando ? `${Math.round((baixando?.fracao ?? 0) * 100)}%` : temModelo ? 'Usar' : 'Baixar e usar'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {temModelo && (
                <div className="actions left">
                  <button className="ghost small" onClick={() => removerBilingue(motor)}>Apagar modelo {sobre.titulo}</button>
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  };

  const bloco = (lingua: Lingua) => {
    const doAparelho = vozesDe(lingua);
    const escolhida = ajustes.voz[lingua];
    const naturais = VOZES_NATURAIS.filter((v) => v.lingua === lingua);
    return (
      <section key={`${lingua}-${versao}`}>
        <h2>{NOME_LINGUA[lingua]}</h2>

        <p className="muted small-text">
          Vozes naturais: ouça antes de escolher. Ao escolher, ela é baixada uma vez (cerca de 60 MB)
          e depois funciona até sem internet.
        </p>
        <ul className="vozes-lista">
          {naturais.map((v) => {
            const emUso = escolhida === PREFIXO_NATURAL + v.id;
            const carregando = baixando?.id === v.id;
            return (
              <li key={v.id} className={`voz-item${emUso ? ' em-uso' : ''}`}>
                <button
                  className="ghost small voz-ouvir"
                  onClick={() => ouvirAmostra(amostraDe(v.id), v.id)}
                  aria-label={tocando === v.id ? `Parar amostra de ${v.nome}` : `Ouvir ${v.nome}`}
                >
                  {tocando === v.id ? '■' : <IconeKit nome="ouvir" width={24} />}
                </button>
                <span className="voz-nome">
                  <strong>{v.nome}</strong>
                  <span className="muted small-text">{v.sotaque}</span>
                </span>
                {emUso ? (
                  <span className="voz-uso">Em uso</span>
                ) : (
                  <button className="primary small voz-baixar" disabled={!!baixando} onClick={() => escolher(lingua, v.id)}>
                    {!carregando && !baixadas.has(v.id) && <IconeKit nome="baixar" width={20} />}
                    {carregando ? `${Math.round((baixando?.fracao ?? 0) * 100)}%` : baixadas.has(v.id) ? 'Usar' : 'Baixar e usar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <label className="form-linha">
          Voz do aparelho
          <select
            value={escolhida.startsWith(PREFIXO_NATURAL) ? '' : escolhida}
            onChange={(e) => mudar({ voz: { ...ajustes.voz, [lingua]: e.target.value } })}
          >
            <option value="">{escolhida.startsWith(PREFIXO_NATURAL) ? 'Usando a voz natural acima' : 'A mais natural do aparelho'}</option>
            {doAparelho.map((v) => (
              <option key={v.name} value={v.name}>{v.name}{v.localService ? '' : ' (online)'}</option>
            ))}
          </select>
        </label>

        <label className="form-linha coluna">
          <span>Velocidade: {ajustes.velocidade[lingua].toFixed(1)}x</span>
          <input
            type="range" min="0.5" max="1.5" step="0.05"
            value={ajustes.velocidade[lingua]}
            onChange={(e) => mudar({ velocidade: { ...ajustes.velocidade, [lingua]: Number(e.target.value) } })}
          />
        </label>

        <div className="actions left">
          <button className="ghost small" onClick={() => void falar({ texto: EXEMPLO[lingua], lingua })}>Ouvir exemplo</button>
        </div>
      </section>
    );
  };

  return (
    <>
      <section className="hero lib-hero">
        <h1>Ajustes</h1>
        <CatMegaphone className="lib-cut" width="58" />
      </section>

      {erro && <p className="aviso">{erro}</p>}
      {blocoBilingue()}
      {bloco('en')}
      {bloco('pt')}

      <section className="actions left">
        <button className="ghost small" onClick={() => ajustesVoz.guardar({ voz: { en: '', pt: '' }, velocidade: { en: 0.9, pt: 1 }, bilingue: '' })}>
          Voltar ao padrão
        </button>
      </section>

      {/* as duas telas que saíram do menu continuam alcançáveis por aqui */}
      <section>
        <h2>Outros</h2>
        <p className="atalhos">
          <a href="#/imprimir">Imprimir folhas</a>
          <a href="#/dados">Backup dos dados</a>
        </p>
      </section>
    </>
  );
}