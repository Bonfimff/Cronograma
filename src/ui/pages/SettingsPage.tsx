import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ajustesVoz, vozesDe, type AjustesVoz, type Lingua,
} from '../../core/lessons/vozes';
import { prepararFala } from '../../core/lessons/vozes';
import { CatMegaphone } from '../components/Cutouts';

/**
 * Ajustes da leitura em voz alta.
 *
 * A lista de vozes do navegador costuma chegar vazia no primeiro instante e só
 * depois é preenchida, então a tela ouve o aviso `voiceschanged` para refazer a
 * lista. As opções ficam no aparelho: cada telefone tem as suas vozes.
 */

const EXEMPLO: Record<Lingua, string> = {
  en: 'How are you today?',
  pt: 'Assim é que a frase soa em português.',
};

const NOME_LINGUA: Record<Lingua, string> = { en: 'Inglês', pt: 'Português' };

export function SettingsPage() {
  const ajustes = useSyncExternalStore((cb) => ajustesVoz.subscribe(cb), () => ajustesVoz.get());
  const [versao, setVersao] = useState(0); // muda quando o navegador termina de carregar as vozes

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const aviso = () => setVersao((v) => v + 1);
    speechSynthesis.addEventListener('voiceschanged', aviso);
    speechSynthesis.getVoices(); // acorda a lista em alguns navegadores
    return () => speechSynthesis.removeEventListener('voiceschanged', aviso);
  }, []);

  const mudar = (p: Partial<AjustesVoz>) => ajustesVoz.guardar({ ...ajustes, ...p });

  const ouvir = (lingua: Lingua) => {
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    speechSynthesis.speak(prepararFala(EXEMPLO[lingua], lingua));
  };

  const bloco = (lingua: Lingua) => {
    const lista = vozesDe(lingua);
    return (
      <section key={`${lingua}-${versao}`}>
        <h2>{NOME_LINGUA[lingua]}</h2>

        <label className="form-linha">
          Voz
          <select
            value={ajustes.voz[lingua]}
            onChange={(e) => mudar({ voz: { ...ajustes.voz, [lingua]: e.target.value } })}
          >
            <option value="">A mais natural do aparelho</option>
            {lista.map((v) => (
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
          <button className="ghost small" onClick={() => ouvir(lingua)}>Ouvir exemplo</button>
        </div>

        {!lista.length && <p className="muted">Este aparelho ainda não mostrou vozes para {NOME_LINGUA[lingua].toLowerCase()}.</p>}
      </section>
    );
  };

  return (
    <>
      <section className="hero lib-hero">
        <h1>Ajustes</h1>
        <CatMegaphone className="lib-cut" width="58" />
      </section>

      {bloco('en')}
      {bloco('pt')}

      <section className="actions left">
        <button className="ghost small" onClick={() => ajustesVoz.guardar({ voz: { en: '', pt: '' }, velocidade: { en: 0.9, pt: 1 } })}>
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
