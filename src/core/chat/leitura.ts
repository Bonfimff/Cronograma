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

export const pararLeitura = () => pararFala();
