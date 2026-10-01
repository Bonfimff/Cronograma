/**
 * Recorta a resposta nas marcas `[[palavra]]`.
 *
 * Quem marca é o servidor, comparando com o vocabulário do banco, então aqui é
 * só desenho: separar o texto em pedaços comuns e pedaços de palavra viva.
 */

export interface Pedaco {
  texto: string;
  palavra: boolean;
}

const MARCA = /\[\[([^\]]+)\]\]/g;

export function recortar(texto: string): Pedaco[] {
  const saida: Pedaco[] = [];
  let fim = 0;
  for (const achado of texto.matchAll(MARCA)) {
    const inicio = achado.index ?? 0;
    if (inicio > fim) saida.push({ texto: texto.slice(fim, inicio), palavra: false });
    saida.push({ texto: achado[1], palavra: true });
    fim = inicio + achado[0].length;
  }
  if (fim < texto.length) saida.push({ texto: texto.slice(fim), palavra: false });
  return saida;
}

/** Sem as marcas: para falar o texto em voz alta ou mostrar fora da conversa. */
export const semMarcas = (texto: string) => texto.replace(MARCA, '$1');
