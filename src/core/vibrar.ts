/**
 * Vibração curta do aparelho, para os momentos em que algo bate na tela:
 * o carimbo no cartão, a linha que se completa, o chicote na palavra.
 *
 * Nem todo aparelho tem motor (e o iPhone ignora esta função no navegador),
 * então isto nunca pode quebrar o jogo: qualquer falha é engolida em silêncio.
 * Quem pediu menos movimento no sistema também fica sem o tranco.
 */

/**
 * O navegador não deixa escolher a força do motor, só quanto tempo ele fica
 * ligado: pulso mais longo é sentido como tranco mais forte. Por isso os
 * valores abaixo são generosos, e os padrões com pausa curta somam impacto em
 * vez de virar cócegas.
 */
export const TRANCO = {
  carimbo: [120] as number[],
  linha: [110, 45, 90, 45, 180] as number[],
  linhaUnica: [150] as number[],
  chicote: [45, 35, 200] as number[],
};

export function vibrar(padrao: number | number[]): void {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(padrao);
  } catch {
    /* sem vibração neste aparelho */
  }
}
