/**
 * Conteúdo escrito à mão no formulário da sessão.
 *
 * O planejamento não pode depender só do que já existe em /content: muitas
 * vezes a palavra da aula é nova. Aqui nascem palavras, expressões e temas com
 * o mínimo preenchido, no mesmo formato do conteúdo de fábrica, para as telas
 * (biblioteca, folha, jogos) tratarem tudo igual.
 */

import type { ContentBundle, ContentRef, Expression, Topic, UserData, Word } from '../types';

/** Identificador legível a partir do texto, com um sufixo para não colidir. */
export function slug(texto: string): string {
  const base = texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${base || 'item'}-${Math.random().toString(36).slice(2, 6)}`;
}

export function novaPalavra(en: string, pt: string, tipo = 'palavra'): Word {
  return {
    id: slug(en),
    word: en.trim(),
    type: tipo,
    translations: pt.trim() ? [{ text: pt.trim() }] : [],
    core_meaning: pt.trim(),
    uses: [],
    variations: [],
    related_words: [],
    examples: [],
    pronunciation: { ipa: '' },
  };
}

export function novaExpressao(en: string, pt: string): Expression {
  return {
    id: slug(en),
    text: en.trim(),
    words: [],
    translation: pt.trim(),
    context: '',
    meaning: pt.trim(),
    examples: [],
  };
}

export function novoTema(titulo: string, refs: ContentRef[] = []): Topic {
  return { id: slug(titulo), title: titulo.trim(), description: '', objective: '', refs };
}

/** Junta o conteúdo novo ao que o usuário já tinha salvo. */
export function saveUserContent(draft: UserData, novo: Partial<ContentBundle>): void {
  const temAlgo = Object.values(novo).some((v) => Array.isArray(v) && v.length);
  if (!temAlgo) return;
  draft.content ??= {};
  const atual = draft.content;
  const juntar = <T extends { id: string }>(velhos: T[] = [], novos: T[] = []) => {
    const ids = new Set(novos.map((x) => x.id));
    return [...velhos.filter((x) => !ids.has(x.id)), ...novos];
  };
  draft.content = {
    ...atual,
    words: juntar(atual.words, novo.words),
    expressions: juntar(atual.expressions, novo.expressions),
    topics: juntar(atual.topics, novo.topics),
    patterns: juntar(atual.patterns, novo.patterns),
    grammar: juntar(atual.grammar, novo.grammar),
    examples: juntar(atual.examples, novo.examples),
    exercises: juntar(atual.exercises, novo.exercises),
  };
}
