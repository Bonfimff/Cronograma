/**
 * Leitura em voz alta de uma folha inteira.
 *
 * Cada trecho sabe em que língua está, porque a mesma voz lendo inglês e
 * português soa errada nos dois. As falas entram numa fila: o navegador só
 * aceita uma de cada vez, então a próxima só começa quando a anterior termina.
 */

export interface Fala {
  texto: string;
  idioma: 'en' | 'pt';
}

const VOZES: Record<Fala['idioma'], string> = { en: 'en-US', pt: 'pt-BR' };

let lendo = false;
let ouvintes = new Set<() => void>();

export function assinarVoz(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export const estaLendo = () => lendo;

function avisar() {
  ouvintes.forEach((o) => o());
}

export function pararLeitura(): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  lendo = false;
  avisar();
}

export function lerFalas(falas: Fala[]): void {
  if (typeof speechSynthesis === 'undefined' || !falas.length) return;
  speechSynthesis.cancel();
  lendo = true;
  avisar();

  falas.forEach((f, i) => {
    const u = new SpeechSynthesisUtterance(f.texto);
    u.lang = VOZES[f.idioma];
    u.rate = f.idioma === 'en' ? 0.9 : 1;
    if (i === falas.length - 1) {
      u.onend = () => { lendo = false; avisar(); };
      u.onerror = u.onend;
    }
    speechSynthesis.speak(u);
  });
}
