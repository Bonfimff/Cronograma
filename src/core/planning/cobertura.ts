/**
 * Cobertura de palavras conhecidas numa aula.
 *
 * A pesquisa de leitura em segunda língua (Hu & Nation, 2000; Laufer & Ravenhorst-Kalovski,
 * 2010) mostra que, para entender um texto sem travar, a pessoa precisa conhecer de 95% a
 * 98% das palavras dele. Por isso a importação confere: nos exemplos, exercícios, escutas,
 * falas, missões e treino de cada aula, quantas palavras o aluno já tem? O que sobra deveria
 * ser só as palavras novas daquela aula.
 *
 * É uma conferência por escrita, com formas simples (works, worked, working → work): serve
 * de alerta na prévia, não bloqueia a importação.
 */

/** As palavras de função mais frequentes do inglês: contam como conhecidas desde o começo. */
export const BASICAS = new Set((
  'a an the i you he she it we they me him her us them my your his its our their mine yours this that these those '
  + 'am is are was were be been being do does did have has had will would can could should may might must shall '
  + 'of to in on at for with from by as about into over under up down out off near after before than then so '
  + 'and or but if because when where what who whom whose which why how not no yes there here very too also just '
  + 'all some any every each many much more most few little other another such only own same both either neither '
  + 'one two three four five six seven eight nine ten first last next now today ok okay please thanks thank hi hello bye '
  + 'i\'m you\'re he\'s she\'s it\'s we\'re they\'re don\'t doesn\'t didn\'t isn\'t aren\'t can\'t won\'t let\'s'
).split(/\s+/));

/** Formas simples de uma palavra: works, worked, working → work; studies → study. */
export function formas(palavra: string): string[] {
  const p = palavra.toLowerCase().replace(/'s$/, '');
  const out = [p];
  if (p.endsWith('ies')) out.push(`${p.slice(0, -3)}y`);
  if (p.endsWith('es')) out.push(p.slice(0, -2));
  if (p.endsWith('s')) out.push(p.slice(0, -1));
  if (p.endsWith('ed')) out.push(p.slice(0, -2), p.slice(0, -1));
  if (p.endsWith('ing')) out.push(p.slice(0, -3), `${p.slice(0, -3)}e`);
  return out;
}

export const palavrasDe = (texto: string): string[] => (texto.toLowerCase().match(/[a-z][a-z']*/g) ?? []).map((w) => w.replace(/'$/, ''));

export function conhecida(palavra: string, conhecidas: Set<string>): boolean {
  return formas(palavra).some((f) => BASICAS.has(f) || conhecidas.has(f));
}

/** Cobertura dos textos em inglês: a fração de palavras conhecidas e as desconhecidas (sem repetir). */
export function cobertura(textos: string[], conhecidas: Set<string>): { total: number; taxa: number; desconhecidas: string[] } {
  const todas = textos.flatMap(palavrasDe);
  const fora = todas.filter((w) => !conhecida(w, conhecidas));
  return { total: todas.length, taxa: todas.length ? 1 - fora.length / todas.length : 1, desconhecidas: [...new Set(fora)] };
}

/** "where do you work" → as palavras de um texto em inglês, para somar ao que é conhecido. */
export function adicionarTexto(conjunto: Set<string>, texto: string): void {
  palavrasDe(texto).forEach((w) => conjunto.add(w));
}
