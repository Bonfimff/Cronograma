/**
 * Completar um verbete à mão.
 *
 * Palavra criada na correria nasce quase vazia: só o inglês e a tradução. Aqui
 * o usuário vai enchendo o verbete aos poucos, anotando exemplos. O exemplo
 * entra no conteúdo do usuário e o item passa a apontar para ele (se o item
 * veio de fábrica, salvamos uma cópia dele com o exemplo a mais; o repositório
 * usa a cópia do usuário no lugar da original).
 */

import type { ContentRef, Example, Expression, Grammar, Pattern, UserData, Word } from '../types';
import { parseRef, resolve } from './repository';
import { saveUserContent, slug } from './novos';

export function adicionarExemplo(draft: UserData, ref: ContentRef, en: string, pt: string): boolean {
  const texto = en.trim();
  if (!texto) return false;
  const item = resolve(ref);
  if (!item) return false;

  const exemplo: Example = { id: slug(texto), en: texto, pt: pt.trim() };
  const { kind } = parseRef(ref);
  const comExemplo = <T extends { examples: string[] }>(x: T): T => ({ ...x, examples: [...x.examples, exemplo.id] });

  if (kind === 'word') saveUserContent(draft, { examples: [exemplo], words: [comExemplo(item as Word)] });
  else if (kind === 'expression') saveUserContent(draft, { examples: [exemplo], expressions: [comExemplo(item as Expression)] });
  else if (kind === 'pattern') saveUserContent(draft, { examples: [exemplo], patterns: [comExemplo(item as Pattern)] });
  else if (kind === 'grammar') saveUserContent(draft, { examples: [exemplo], grammar: [comExemplo(item as Grammar)] });
  else return false;

  return true;
}

/** Guarda uma mudança feita à mão no verbete (o item vira conteúdo do usuário). */
export function atualizarItem(draft: UserData, ref: ContentRef, mudanca: Record<string, unknown>): boolean {
  const item = resolve(ref);
  if (!item) return false;
  const novo = { ...(item as object), ...mudanca } as { id: string };
  const { kind } = parseRef(ref);
  if (kind === 'word') saveUserContent(draft, { words: [novo as Word] });
  else if (kind === 'expression') saveUserContent(draft, { expressions: [novo as Expression] });
  else if (kind === 'pattern') saveUserContent(draft, { patterns: [novo as Pattern] });
  else if (kind === 'grammar') saveUserContent(draft, { grammar: [novo as Grammar] });
  else return false;
  return true;
}

/** Acrescenta um uso ("uso: estado", "uso: maneira") a uma palavra. */
export function adicionarUso(draft: UserData, ref: ContentRef, label: string, meaning: string, explanation: string): boolean {
  const w = resolve(ref) as Word | undefined;
  if (!w || parseRef(ref).kind !== 'word' || !label.trim()) return false;
  const uso = {
    id: slug(label),
    label: label.trim(),
    meaning: meaning.trim(),
    explanation: explanation.trim(),
    examples: [] as string[],
  };
  saveUserContent(draft, { words: [{ ...w, uses: [...w.uses, uso] }] });
  return true;
}

/** Muda um campo de um uso da palavra. */
export function atualizarUso(draft: UserData, ref: ContentRef, usoId: string, mudanca: Record<string, unknown>): boolean {
  const w = resolve(ref) as Word | undefined;
  if (!w || parseRef(ref).kind !== 'word') return false;
  saveUserContent(draft, {
    words: [{ ...w, uses: w.uses.map((u) => (u.id === usoId ? { ...u, ...mudanca } : u)) }],
  });
  return true;
}

/** Anota um exemplo dentro de um uso, e não solto no verbete. */
export function adicionarExemploNoUso(draft: UserData, ref: ContentRef, usoId: string, en: string, pt: string): boolean {
  const w = resolve(ref) as Word | undefined;
  const texto = en.trim();
  if (!w || parseRef(ref).kind !== 'word' || !texto) return false;
  const exemplo: Example = { id: slug(texto), en: texto, pt: pt.trim() };
  saveUserContent(draft, {
    examples: [exemplo],
    words: [{ ...w, uses: w.uses.map((u) => (u.id === usoId ? { ...u, examples: [...u.examples, exemplo.id] } : u)) }],
  });
  return true;
}

/** Tira um uso da palavra (os exemplos dele continuam guardados). */
export function removerUso(draft: UserData, ref: ContentRef, usoId: string): boolean {
  const w = resolve(ref) as Word | undefined;
  if (!w || parseRef(ref).kind !== 'word') return false;
  saveUserContent(draft, { words: [{ ...w, uses: w.uses.filter((u) => u.id !== usoId) }] });
  return true;
}
