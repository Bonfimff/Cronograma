/**
 * Por que a pronúncia escorregou: os erros de quem fala português são previsíveis
 * (o "th" vira s, f ou d; "ship" e "sheep" soam iguais; sobra uma vogal no fim, "dog-i";
 * o "h" some ou vira "r"; o "l" final vira "u"; o "-ed" vira sílaba).
 *
 * Aqui comparamos o que era para dizer com o que o reconhecedor ouviu e damos um nome ao
 * padrão. É por escrita, não por som, então é uma pista e não um laudo: o relatório mostra
 * os padrões que se repetem, não cada caso.
 */

export type Padrao = 'th' | 'vogal' | 'vogal-final' | 'h' | 'l-final' | 'ed' | 'r' | 's-final' | 'outro';

export const NOME_PADRAO: Record<Padrao, string> = {
  th: 'Som de "th" (think, this)',
  vogal: 'Vogal curta x longa (ship / sheep)',
  'vogal-final': 'Vogal extra no fim (dog-i, big-i)',
  h: '"h" aspirado (house, hello)',
  'l-final': '"l" no fim soando como "u" (feel, school)',
  ed: 'Final "-ed" (worked, played)',
  r: 'Som do "r" (right, very)',
  's-final': '"s" no fim sobrando ou faltando (works, friend)',
  outro: 'Outras trocas',
};

const limpa = (s: string) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
const semVogais = (s: string) => s.replace(/[aeiouy]+/g, '_');

/** O primeiro par de palavras que difere entre o alvo e o que foi ouvido. */
function parDiferente(alvo: string, ouvido: string): [string, string] | null {
  const a = limpa(alvo), o = limpa(ouvido);
  for (let i = 0; i < a.length; i++) if (a[i] !== o[i]) return [a[i], o[i] ?? ''];
  return null;
}

export function classificar(alvo: string, ouvido: string): Padrao {
  const par = parDiferente(alvo, ouvido);
  if (!par) return 'outro';
  const [a, o] = par;
  if (!o) return 'outro';
  if (a.includes('th') && !o.includes('th')) return 'th';
  if (o === `${a}s` || o === `${a}es` || a === `${o}s`) return 's-final';
  if (a.endsWith('ed') && (!o.endsWith('ed') || o.endsWith('edi'))) return 'ed';
  if (/[bcdfgkmnpt]$/.test(a) && o.length === a.length + 1 && o.startsWith(a) && /[ieuy]$/.test(o)) return 'vogal-final';
  if (a.startsWith('h') && (o === a.slice(1) || (!o.startsWith('h') && o.slice(0, 2) === a.slice(1, 3)) || o.startsWith('r'))) return 'h';
  if (a.endsWith('l') && /(u|w|o)$/.test(o) && o.slice(0, 2) === a.slice(0, 2)) return 'l-final';
  if (semVogais(a) === semVogais(o)) return 'vogal';
  if (a.includes('r') && o.replace(/h/g, 'r') === a) return 'r';
  return 'outro';
}

/** Conta os padrões das tentativas erradas que têm o que foi ouvido. */
export function padroesDeFala(tentativas: { en: string; ok: boolean; ouvido?: string }[]): { padrao: Padrao; nome: string; vezes: number; exemplos: string[] }[] {
  const m = new Map<Padrao, { vezes: number; exemplos: string[] }>();
  for (const t of tentativas) {
    if (t.ok || !t.ouvido) continue;
    const p = classificar(t.en, t.ouvido);
    const cur = m.get(p) ?? { vezes: 0, exemplos: [] };
    cur.vezes++;
    if (cur.exemplos.length < 3 && !cur.exemplos.includes(t.en)) cur.exemplos.push(t.en);
    m.set(p, cur);
  }
  return [...m.entries()].map(([padrao, v]) => ({ padrao, nome: NOME_PADRAO[padrao], ...v })).sort((a, b) => b.vezes - a.vezes);
}
