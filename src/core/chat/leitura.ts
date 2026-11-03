/**
 * Leitura em voz alta de uma fala da conversa.
 *
 * A frase é portuguesa com palavras em inglês no meio, e isso não se lê com uma
 * voz só: a voz portuguesa diz "rest" como "héste", e a inglesa lê o português
 * com sotaque. Então cortamos a frase nas marcas e cada pedaço vai na voz da
 * sua língua, um atrás do outro.
 */

import { falar, pararFala, type Parte } from '../lessons/vozes';
import { recortar, semMarcas } from './marcas';

export function lerFala(texto: string, chave?: string): void {
  void falar(recortar(texto).map((p) => ({ texto: p.texto, lingua: p.palavra ? 'en' : 'pt' })), 1, chave);
}

export const partesDe = (texto: string): Parte[] =>
  recortar(texto).map((p) => ({ texto: p.texto, lingua: p.palavra ? 'en' : 'pt' }));

/** Abaixo disso, uma vírgula não vira corte: a fala ficaria picotada. */
const TRECHO_MINIMO = 35;

/**
 * Onde termina o próximo trecho que já dá para falar, ou -1. Corta no fim da frase, ou numa
 * vírgula se o trecho já estiver longo: a voz não precisa esperar a resposta inteira.
 * Só corta com espaço depois, porque o texto ainda está chegando ("3." pode virar "3.5").
 */
export function proximoTrecho(texto: string, desde: number): number {
  let colchetes = 0;
  for (let i = desde; i < texto.length - 1; i++) {
    if (texto.startsWith('[[', i)) colchetes++;
    else if (texto.startsWith(']]', i)) colchetes--;
    if (colchetes > 0 || !/\s/.test(texto[i + 1])) continue;
    if (/[.!?…\n]/.test(texto[i]) || (/[,;:]/.test(texto[i]) && i - desde >= TRECHO_MINIMO)) return i + 1;
  }
  return -1;
}

/** A resposta inteira em trechos, para o que chega de uma vez. */
export function trechosDe(texto: string): string[] {
  const saida: string[] = [];
  let desde = 0;
  for (let fim = proximoTrecho(texto, desde); fim >= 0; fim = proximoTrecho(texto, desde)) {
    saida.push(texto.slice(desde, fim));
    desde = fim;
  }
  if (texto.slice(desde).trim()) saida.push(texto.slice(desde));
  return saida;
}

const plano = (t: string) => semMarcas(t).replace(/\s+/g, ' ').trim();

/**
 * O que a resposta final tem além do que já foi falado: o servidor acrescenta a correção do
 * inglês na frente, e o fim da resposta só chega aqui. Se o modelo refez a resposta e o já
 * falado não está mais nela, não há como emendar: fica como está.
 */
export function faltaFalar(final: string, falados: string[]): string {
  const pedacos = trechosDe(final);
  if (!falados.length) return final;
  const ditos = falados.map(plano);
  const inicio = pedacos.findIndex((p) => plano(p) === ditos[0]);
  if (inicio < 0 || !ditos.every((d, i) => plano(pedacos[inicio + i] ?? '') === d)) return '';
  return [...pedacos.slice(0, inicio), ...pedacos.slice(inicio + ditos.length)].join('');
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
