/**
 * Leitura em voz alta de uma fala da conversa.
 *
 * A frase é portuguesa com palavras em inglês no meio, e isso não se lê com uma
 * voz só: a voz portuguesa diz "rest" como "héste", e a inglesa lê o português
 * com sotaque. Então cortamos a frase nas marcas e cada pedaço vai na voz da
 * sua língua, um atrás do outro.
 */

import { prepararFala } from '../lessons/vozes';
import { recortar } from './marcas';

export function lerFala(texto: string): void {
  const voz = window.speechSynthesis;
  voz.cancel();
  recortar(texto)
    .filter((p) => p.texto.trim())
    .forEach((p) => voz.speak(prepararFala(p.texto, p.palavra ? 'en' : 'pt')));
}

export const pararLeitura = () => window.speechSynthesis.cancel();
