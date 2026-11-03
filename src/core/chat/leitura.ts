/**
 * Leitura em voz alta de uma fala da conversa.
 *
 * A frase é portuguesa com palavras em inglês no meio, e isso não se lê com uma
 * voz só: a voz portuguesa diz "rest" como "héste", e a inglesa lê o português
 * com sotaque. Então cortamos a frase nas marcas e cada pedaço vai na voz da
 * sua língua, um atrás do outro.
 */

import { falar, pararFala } from '../lessons/vozes';
import { recortar } from './marcas';

export function lerFala(texto: string, chave?: string): void {
  void falar(recortar(texto).map((p) => ({ texto: p.texto, lingua: p.palavra ? 'en' : 'pt' })), 1, chave);
}

/** Como `lerFala`, mas avisa quando acabou de falar: a conversa por voz volta a ouvir só então. */
export function lerFalaAteOFim(texto: string, chave?: string): Promise<void> {
  return falar(recortar(texto).map((p) => ({ texto: p.texto, lingua: p.palavra ? 'en' : 'pt' })), 1, chave);
}

export const pararLeitura = () => pararFala();

const KEY_AUTOMATICA = 'ingles-hibrido:conversa-leitura-automatica';

/** Ler sozinho cada resposta do amigo. Fica no aparelho, como as vozes. */
export const leituraAutomatica = {
  get(): boolean {
    try { return localStorage.getItem(KEY_AUTOMATICA) === '1'; } catch { return false; }
  },
  guardar(ligada: boolean): void {
    try { localStorage.setItem(KEY_AUTOMATICA, ligada ? '1' : '0'); } catch { /* sem armazenamento */ }
  },
};
