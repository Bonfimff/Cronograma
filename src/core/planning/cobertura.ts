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

/**
 * Marcadores de português que não existem em inglês.
 *
 * A cobertura só conta o inglês da aula. O português (os enunciados dos exercícios e as
 * traduções) tinha de ficar de fora, e para isso bastava procurar acento — só que "Isso me
 * parece bom" e as respostas que a gente aceita digitadas sem acento ("Estes livros na mesa
 * sao pesados") passavam por inglês e entravam na conta como palavras desconhecidas, puxando
 * a cobertura para baixo sem motivo.
 *
 * As palavras que existem nas duas línguas (a, e, o, do, no, as, me, so, sou, data, item…)
 * ficam fora desta lista de propósito: uma só delas não pode condenar uma frase em inglês.
 */
const MARCAS_PT = new Set((
  'de da das dos que nao uma um para com em na nos nas por mais como onde quando voce voces eu '
  + 'meu minha meus minhas seu sua seus suas teu tua nosso nossa dele dela deles delas '
  + 'isso isto aquilo aquele aquela aqueles aquelas este esta estes estas esse essa esses essas '
  + 'sou somos sao estou estamos estao ser esta tem temos muito pouco ja sem ate entao tambem '
  + 'ele ela eles elas lhe nem mesmo mesma qual quais cada frase frases palavra palavras '
  + 'monte traduza escreva responda complete ligue relacione significa pergunte diga coloque '
  + 'ingles portugues'
).split(/\s+/));

/**
 * O texto está em português? Um acento, ou uma palavra que só existe em português, basta.
 * Usado para deixar o português fora da conta da cobertura (ver MARCAS_PT).
 */
export function ehPortugues(texto: string): boolean {
  if (/[ãõçáéíóúâêôàü]/i.test(texto)) return true;
  return palavrasDe(texto).some((w) => MARCAS_PT.has(w));
}

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
