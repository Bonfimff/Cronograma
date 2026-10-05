/**
 * O que estudar agora: a mesma resposta para todas as telas.
 *
 * Antes, cada parte do app decidia sozinha: a Revisão olhava só o histórico das folhas, os jogos
 * sorteavam do vocabulário inteiro, o chat priorizava pelo servidor e a memória por palavra
 * (FSRS, core/progress/memoria.ts) só aparecia no relatório. Aqui tudo isso vira uma resposta só:
 * - a aula em foco (a de hoje ainda não feita, a que ficou pela metade ou a última feita);
 * - as palavras quase esquecidas segundo a memória (de todas as atividades, não só das folhas);
 * - a lista de palavras em foco, que os jogos, o chat e o Hoje usam sem a pessoa pedir.
 *
 * O endereço também pode escolher o foco: ?foco=revisar, ?foco=aula:ENG-2026-0004 ou
 * ?foco=palavras:work,free (ver palavrasDoFoco).
 */

import type { ContentRef, Session, UserData } from '../types';
import { content, parseRef, resolve } from '../content/repository';
import { addDays, today } from '../dates';
import { eventos, memoria, type MemoriaPalavra } from '../progress/memoria';

export interface AulaEmFoco {
  sessao: Session;
  /** palavras e expressões da aula, em inglês */
  palavras: string[];
  /** a aula ficou pela metade (dá para continuar de onde parou) */
  continuar: boolean;
}

export interface Foco {
  aula?: AulaEmFoco;
  /** quase esquecidas (chance de lembrar abaixo de 85%), da mais urgente para a menos */
  revisar: MemoriaPalavra[];
  /** quantas palavras você deve lembrar hoje (soma das chances) */
  lembradasHoje: number;
  /** aula primeiro, depois as quase esquecidas: o que os jogos e o chat usam por padrão */
  palavras: string[];
}

/** Quantas palavras em foco vão para o chat e para os jogos. */
export const MAXIMO_FOCO = 20;

const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/** O texto em inglês de um conteúdo: "word:work" → "work"; "expression:x" → "thank you". */
export function inglesDe(ref: ContentRef): string | undefined {
  const item = resolve(ref) as { word?: string; text?: string } | undefined;
  return (item?.word ?? item?.text)?.replace(/[?!.]+$/, '').trim() || undefined;
}

/** As palavras e expressões que uma aula ensina, revisa e usa de apoio. */
export function palavrasDaSessao(s: Session): string[] {
  const refs = [...s.refs, ...(s.palavras?.novas ?? []), ...(s.palavras?.revisar ?? []), ...(s.palavras?.apoio ?? [])];
  return unicos(refs.filter((r) => ['word', 'expression'].includes(parseRef(r).kind)).map((r) => inglesDe(r) ?? ''));
}

/** A aula que importa agora: pela metade, a de hoje ainda não feita, ou a última feita (até 3 dias). */
export function aulaEmFoco(data: UserData, hoje = today()): AulaEmFoco | undefined {
  const pelaMetade = data.sessions
    .filter((s) => s.status === 'in_progress')
    .sort((a, b) => (b.startedAt ?? b.date).localeCompare(a.startedAt ?? a.date))[0];
  const deHoje = data.sessions.filter((s) => s.date === hoje && s.status === 'planned')[0];
  const recente = data.sessions
    .filter((s) => s.status === 'done' && s.date >= addDays(hoje, -3) && s.date <= hoje)
    .sort((a, b) => (b.finishedAt ?? b.date).localeCompare(a.finishedAt ?? a.date))[0];
  const sessao = pelaMetade ?? deHoje ?? recente;
  return sessao ? { sessao, palavras: palavrasDaSessao(sessao), continuar: sessao === pelaMetade } : undefined;
}

export function focoDeEstudo(data: UserData, hoje = today()): Foco {
  const refParaEn = (ref: string) => inglesDe(ref as ContentRef);
  const vocab = new Set(content.words.map((w) => w.word.toLowerCase()));
  const mem = memoria(eventos(data, refParaEn, vocab), new Date(`${hoje}T23:59:59`).getTime());
  const aula = aulaEmFoco(data, hoje);
  return {
    aula,
    revisar: mem.emRisco,
    lembradasHoje: mem.lembradasHoje,
    palavras: unicos([...(aula?.palavras ?? []), ...mem.emRisco.map((p) => p.en)]).slice(0, MAXIMO_FOCO),
  };
}

/**
 * As palavras de um foco escolhido pelo endereço. Sem parâmetro (ou "tudo"), lista vazia: o jogo
 * usa o vocabulário inteiro.
 */
export function palavrasDoFoco(data: UserData, param: string | null | undefined): string[] {
  if (!param || param === 'tudo') return [];
  if (param === 'revisar') return focoDeEstudo(data).revisar.map((p) => p.en);
  if (param === 'agora') return focoDeEstudo(data).palavras;
  if (param.startsWith('aula:')) {
    const s = data.sessions.find((x) => x.id === param.slice(5));
    return s ? palavrasDaSessao(s) : [];
  }
  if (param.startsWith('palavras:')) return unicos(param.slice(9).split(','));
  return [];
}

/** Nome curto do foco, para a tela dizer com o que está jogando. */
export function rotuloDoFoco(data: UserData, param: string | null | undefined): string {
  if (param === 'revisar') return 'as palavras que estão escapando';
  if (param === 'agora') return 'as palavras em foco agora';
  if (param?.startsWith('aula:')) {
    const s = data.sessions.find((x) => x.id === param.slice(5));
    return s ? `as palavras da aula "${s.title}"` : 'as palavras da aula';
  }
  if (param?.startsWith('palavras:')) return 'as palavras escolhidas';
  return 'todo o vocabulário';
}

/**
 * Coloca o foco num conjunto de itens de jogo: ficam só os itens em foco, completados com outros
 * (sorteados) até `minimo`, para a rodada ter tamanho. Sem foco, ou sem nenhum item em foco, tudo.
 */
export function comFoco<T>(itens: T[], foco: string[], chave: (x: T) => string, minimo = 10): T[] {
  if (!foco.length) return itens;
  const alvo = new Set(foco.map((w) => w.toLowerCase()));
  const dentro = itens.filter((x) => alvo.has(chave(x).toLowerCase()));
  if (!dentro.length) return itens;
  const fora = itens.filter((x) => !alvo.has(chave(x).toLowerCase()));
  for (let i = fora.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fora[i], fora[j]] = [fora[j], fora[i]];
  }
  return [...dentro, ...fora.slice(0, Math.max(0, minimo - dentro.length))];
}
