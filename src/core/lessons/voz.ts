/**
 * Leitura em voz alta de uma folha inteira, com controle de ritmo.
 *
 * Cada trecho sabe em que língua está, porque a mesma voz lendo inglês e
 * português soa errada nos dois. O navegador só toca uma fala por vez, então
 * aqui há um tocador: fala, espera a pausa escolhida, chama a próxima, e no fim
 * repete a lista quantas vezes o usuário pediu.
 */

import { prepararFala } from './vozes';

export interface Fala {
  texto: string;
  idioma: 'en' | 'pt';
}

export interface OpcoesVoz {
  /** Ler também a tradução em português. */
  traducao: boolean;
  /** 0,5x a 2x. */
  velocidade: number;
  /** Segundos de silêncio entre uma fala e a próxima. */
  pausa: number;
  /** Quantas vezes repetir a lista (ignorado quando `semParar`). */
  vezes: number;
  semParar: boolean;
}

export const OPCOES_PADRAO: OpcoesVoz = { traducao: true, velocidade: 1, pausa: 0.6, vezes: 1, semParar: false };


const OPCOES_KEY = 'ingles-hibrido:voz';

export function lerOpcoes(): OpcoesVoz {
  try {
    const raw = localStorage.getItem(OPCOES_KEY);
    return raw ? { ...OPCOES_PADRAO, ...(JSON.parse(raw) as Partial<OpcoesVoz>) } : OPCOES_PADRAO;
  } catch {
    return OPCOES_PADRAO;
  }
}

export function guardarOpcoes(op: OpcoesVoz): void {
  try { localStorage.setItem(OPCOES_KEY, JSON.stringify(op)); } catch { /* sem armazenamento */ }
}

let lendo = false;
let cancelar = false;
let espera: number | undefined;
const ouvintes = new Set<() => void>();

export function assinarVoz(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export const estaLendo = () => lendo;
const avisar = () => ouvintes.forEach((o) => o());

export function pararLeitura(): void {
  cancelar = true;
  window.clearTimeout(espera);
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  lendo = false;
  avisar();
}

function falar(f: Fala, velocidade: number): Promise<void> {
  return new Promise((pronto) => {
    // a voz e o ritmo de cada língua vêm dos ajustes; aqui só entra o fator
    // escolhido no painel de reprodução
    const u = prepararFala(f.texto, f.idioma, velocidade);
    u.onend = () => pronto();
    u.onerror = () => pronto();
    speechSynthesis.speak(u);
  });
}

const dormir = (ms: number) => new Promise<void>((pronto) => { espera = window.setTimeout(pronto, ms); });

export async function lerFalas(todas: Fala[], op: OpcoesVoz = OPCOES_PADRAO): Promise<void> {
  if (typeof speechSynthesis === 'undefined' || !todas.length) return;
  const falas = op.traducao ? todas : todas.filter((f) => f.idioma === 'en');
  if (!falas.length) return;

  speechSynthesis.cancel();
  cancelar = false;
  lendo = true;
  avisar();

  const voltas = op.semParar ? Infinity : Math.max(1, op.vezes);
  for (let volta = 0; volta < voltas && !cancelar; volta++) {
    for (const f of falas) {
      if (cancelar) break;
      await falar(f, op.velocidade);
      if (cancelar) break;
      if (op.pausa > 0) await dormir(op.pausa * 1000);
    }
  }

  lendo = false;
  avisar();
}
