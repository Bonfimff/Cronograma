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
