/**
 * Busca da Biblioteca: procura em tudo que está na capa do caderno, pelo texto
 * em inglês, pela tradução ou pelo nome da folha.
 *
 * A comparação ignora maiúsculas e acentos, então "padroes" acha "Padrões" e
 * "voce" acha "você".
 */

import type { ContentRef, UserData } from '../types';
import { content } from './repository';
import { sheetsOf } from '../library/sheets';

export interface Achado {
  chave: string;      // identificador único do resultado
  titulo: string;     // o que aparece à esquerda
  detalhe: string;    // o que aparece à direita
  onde: string;       // nome da folha onde está
  href?: string;      // link para o verbete, quando existe
  folha?: string;     // folha a abrir, quando não há verbete
}

export function simplificar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const contem = (alvo: string, termo: string) => simplificar(alvo).includes(termo);

export function buscar(data: UserData, termo: string, limite = 30): Achado[] {
  const t = simplificar(termo);
  if (t.length < 2) return [];
  const achados: Achado[] = [];

  const ref = (r: ContentRef) => `#/conteudo/${r}`;

  for (const w of content.words) {
    const pt = w.translations.map((x) => x.text).join(', ');
    if (contem(w.word, t) || contem(pt, t) || contem(w.core_meaning ?? '', t)) {
      achados.push({ chave: `word:${w.id}`, titulo: w.word, detalhe: pt, onde: 'Vocabulário', href: ref(`word:${w.id}`) });
    }
  }
  for (const e of content.expressions) {
    if (contem(e.text, t) || contem(e.translation, t) || contem(e.meaning ?? '', t)) {
      achados.push({ chave: `expression:${e.id}`, titulo: e.text, detalhe: e.translation, onde: 'Expressões', href: ref(`expression:${e.id}`) });
    }
  }
  for (const p of content.patterns) {
    if (contem(p.formula, t) || contem(p.name, t)) {
      achados.push({ chave: `pattern:${p.id}`, titulo: p.formula, detalhe: p.name, onde: 'Padrões', href: ref(`pattern:${p.id}`) });
    }
  }
  for (const g of content.grammar) {
    if (contem(g.title, t) || contem(g.explanation ?? '', t)) {
      achados.push({ chave: `grammar:${g.id}`, titulo: g.title, detalhe: '', onde: 'Gramática', href: ref(`grammar:${g.id}`) });
    }
  }
  for (const s of sheetsOf(data)) {
    if (contem(s.title, t)) {
      achados.push({ chave: `folha:${s.id}`, titulo: s.title, detalhe: `${s.items.length} itens`, onde: 'Folha sua', folha: s.id });
    }
    s.items.forEach((item, i) => {
      if (contem(item.en, t) || contem(item.pt, t)) {
        achados.push({ chave: `folha:${s.id}:${i}`, titulo: item.en, detalhe: item.pt, onde: s.title, folha: s.id });
      }
    });
  }

  // quem começa com o termo aparece antes de quem só o contém no meio
  const comeca = (a: Achado) => (simplificar(a.titulo).startsWith(t) ? 0 : 1);
  return achados.sort((a, b) => comeca(a) - comeca(b)).slice(0, limite);
}
