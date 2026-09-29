/**
 * Vibração curta do aparelho, para os momentos em que algo bate na tela:
 * o carimbo no cartão, a linha que se completa, o chicote na palavra.
 *
 * Nem todo aparelho tem motor (e o iPhone ignora esta função no navegador),
 * então isto nunca pode quebrar o jogo: qualquer falha é engolida em silêncio.
 * Quem pediu menos movimento no sistema também fica sem o tranco.
 */

export const TRANCO = {
  carimbo: [28] as number[],
  linha: [40, 50, 70] as number[],
  linhaUnica: [55] as number[],
  chicote: [10, 30, 60] as number[],
};

export function vibrar(padrao: number | number[]): void {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(padrao);
  } catch {
    /* sem vibração neste aparelho */
  }
}
