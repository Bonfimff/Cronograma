import type {
  ContentRef, Exercise, ExerciseType, FraseAula, Habilidade, Session, SessionKind, TreinoChat, UserData,
} from '../types';
import { simplificar } from '../content/search';
import { PACKAGE_FORMAT, type PackageSession, type WeekPackage } from './weekPackage';

/**
 * AULA MONTADA À MÃO: tudo o que o pacote semanal permite numa sessão, em campos
 * que uma pessoa preenche sem IA. O rascunho vira um pacote de um dia só e passa
 * pela mesma conferência e aplicação da importação de semana.
 */

export type Papel = 'novas' | 'revisar' | 'apoio';

/** Palavra que ainda não está no vocabulário: entra nele junto com a aula. */
export interface PalavraNova {
  en: string;
  pt: string;
  papel: Papel;
  tipo?: string;
  significado?: string;
  ipa?: string;
  exemplos: FraseAula[];
}

export interface ExercicioRascunho {
  id?: string;
  type: ExerciseType;
  prompt: string;
  /** respostas aceitas, separadas por | */
  answer: string;
  /** alternativas (escolha), peças (montar frase) ou pares "inglês = português" (ligar), separados por | */
  options: string;
  habilidade?: Habilidade;
}

export interface RascunhoAula {
  /** código da aula, quando está editando uma que já existe */
  id?: string;
  date: string;
  kind: SessionKind;
  title: string;
  objective: string;
  whenToUse: string;
  palavras: Record<Papel, ContentRef[]>;
  palavrasNovas: PalavraNova[];
  aquecimento: string;
  escuta: FraseAula[];
  fala: FraseAula[];
  missao: { situacao: string; tarefas: FraseAula[] };
  copy: string[];
  quiz: string[];
  practice: string;
  intro: string;
  contexto: string;
  dicas: string[];
  exercicios: ExercicioRascunho[];
  treino: TreinoChat[];
  resultado: string;
  criterios: string[];
}

export const LIMITES = { novas: 4, copy: 3, quiz: 6 } as const;

export function rascunhoVazio(date: string): RascunhoAula {
  return {
    date, kind: 'new', title: '', objective: '', whenToUse: '',
    palavras: { novas: [], revisar: [], apoio: [] }, palavrasNovas: [],
    aquecimento: '', escuta: [], fala: [], missao: { situacao: '', tarefas: [] },
    copy: [], quiz: [], practice: '', intro: '', contexto: '', dicas: [],
    exercicios: [], treino: [], resultado: '', criterios: [],
  };
}

/** Código de uma palavra nova a partir do texto em inglês ("look up" vira "look-up"). */
export const idDaPalavra = (en: string) => simplificar(en).replace(/[^a-z0-9']+/g, '-').replace(/^-|-$/g, '');

const limpo = (l: string[]) => l.map((x) => x.trim()).filter(Boolean);
const frases = (l: FraseAula[]) => l.map((f) => ({ en: f.en.trim(), pt: f.pt.trim() })).filter((f) => f.en);
const partes = (s: string) => s.split('|').map((x) => x.trim()).filter(Boolean);

/** O rascunho no formato do pacote semanal (um dia, uma aula). */
export function pacoteDoRascunho(r: RascunhoAula, aluno: UserData): WeekPackage {
  const jaTem = new Set((aluno.content?.words ?? []).map((w) => w.id));
  const novas = r.palavrasNovas.filter((n) => idDaPalavra(n.en) && n.pt.trim());
  const words = novas.filter((n) => !jaTem.has(idDaPalavra(n.en))).map((n) => {
    const id = idDaPalavra(n.en);
    return {
      id, word: n.en.trim(), type: n.tipo?.trim() ?? '',
      translations: [{ text: n.pt.trim() }],
      core_meaning: n.significado?.trim() || n.pt.trim(),
      pronunciation: { ipa: n.ipa?.trim() ?? '' },
      examples: frases(n.exemplos).map((_, i) => `${id}-ex${i + 1}`),
      uses: [], variations: [], related_words: [],
    };
  });
  const examples = novas.flatMap((n) => frases(n.exemplos).map((f, i) => ({ id: `${idDaPalavra(n.en)}-ex${i + 1}`, ...f })));

  const papel = (p: Papel) => [...new Set([
    ...r.palavras[p], ...novas.filter((n) => n.papel === p).map((n) => `word:${idDaPalavra(n.en)}` as ContentRef),
  ])];
  const palavras = { novas: papel('novas'), revisar: papel('revisar'), apoio: papel('apoio') };
  const refs = [...new Set([...palavras.novas, ...palavras.revisar, ...palavras.apoio])];

  const missao = r.missao.situacao.trim() ? { situacao: r.missao.situacao.trim(), tarefas: frases(r.missao.tarefas) } : undefined;
  const aula = {
    ...(r.aquecimento && { aquecimento: r.aquecimento as ContentRef }),
    ...(frases(r.escuta).length && { escuta: frases(r.escuta) }),
    ...(frases(r.fala).length && { fala: frases(r.fala) }),
    ...(missao && { missao }),
  };
  const sheet = {
    ...(limpo(r.copy).length && { copy: limpo(r.copy) }),
    ...(limpo(r.quiz).length && { quiz: limpo(r.quiz) }),
    ...(r.practice.trim() && { practice: r.practice.trim() }),
  };
  const app = {
    ...(r.intro.trim() && { intro: r.intro.trim() }),
    ...(r.contexto.trim() && { context: r.contexto.trim() }),
    ...(limpo(r.dicas).length && { tips: limpo(r.dicas) }),
  };
  const exercises = r.exercicios.filter((e) => e.prompt.trim()).map((e) => {
    const ops = partes(e.options);
    const resp = partes(e.answer);
    return {
      ...(e.id && { id: e.id }),
      type: e.type, prompt: e.prompt.trim(),
      ...(resp.length && { answer: resp.length === 1 ? resp[0] : resp }),
      ...(e.type === 'choice' && ops.length && { options: ops }),
      ...(e.type === 'build' && ops.length && { tokens: ops }),
      ...(e.type === 'match' && ops.length && { pairs: ops.map((o) => o.split('=').map((x) => x.trim()) as [string, string]) }),
      ...(e.habilidade && { habilidade: e.habilidade }),
    } as Omit<Exercise, 'id' | 'refs'> & { id?: string };
  });
  const treino = r.treino.filter((t) => t.en.trim()).map((t) => ({
    en: t.en.trim(), ...(t.pt?.trim() && { pt: t.pt.trim() }), ...(t.resposta?.trim() && { resposta: t.resposta.trim() }),
  }));

  const sessao: PackageSession = {
    ...(r.id && { id: r.id }),
    kind: r.kind,
    title: r.title.trim(),
    ...(r.objective.trim() && { objective: r.objective.trim() }),
    ...(r.whenToUse.trim() && { whenToUse: r.whenToUse.trim() }),
    refs,
    palavras,
    ...(Object.keys(aula).length && { aula }),
    ...(Object.keys(sheet).length && { sheet }),
    ...(Object.keys(app).length && { app }),
    ...(exercises.length && { exercises }),
    ...(treino.length && { chat: { treino } }),
    ...(r.resultado.trim() && { expected: { result: r.resultado.trim(), ...(limpo(r.criterios).length && { criteria: limpo(r.criterios) }) } }),
  };
  return {
    format: PACKAGE_FORMAT,
    ...((words.length || examples.length) && { content: { words, examples } as unknown as WeekPackage['content'] }),
    days: [{ date: r.date, sessions: [sessao] }],
  };
}

/** Uma aula que já existe, de volta para o rascunho (para editar enquanto não começou). */
export function rascunhoDaSessao(s: Session, dados: UserData): RascunhoAula {
  const exercicios = (s.exerciseIds ?? []).map((id) => dados.content?.exercises?.find((e) => e.id === id)).filter(Boolean)
    .map((e) => ({
      id: e!.id, type: e!.type, prompt: e!.prompt,
      answer: Array.isArray(e!.answer) ? e!.answer.join(' | ') : e!.answer ?? '',
      options: e!.pairs ? e!.pairs.map(([a, b]) => `${a} = ${b}`).join(' | ') : (e!.options ?? e!.tokens ?? []).join(' | '),
      habilidade: e!.habilidade,
    }));
  const p = s.palavras ?? {};
  const marcadas = new Set([...(p.novas ?? []), ...(p.revisar ?? []), ...(p.apoio ?? [])]);
  return {
    id: s.id, date: s.date, kind: s.kind, title: s.title, objective: s.objective ?? '', whenToUse: s.whenToUse ?? '',
    // sem papéis (aula antiga ou montada sem eles): os conteúdos entram como "novas"
    palavras: { novas: [...(p.novas ?? []), ...s.refs.filter((r) => !marcadas.has(r))], revisar: p.revisar ?? [], apoio: p.apoio ?? [] },
    palavrasNovas: [],
    aquecimento: s.aula?.aquecimento ?? '',
    escuta: s.aula?.escuta ?? [], fala: s.aula?.fala ?? [],
    missao: s.aula?.missao ?? { situacao: '', tarefas: [] },
    copy: s.sheet?.copy ?? [], quiz: s.sheet?.quiz ?? [], practice: s.sheet?.practice ?? '',
    intro: s.app?.intro ?? '', contexto: s.app?.context ?? '', dicas: s.app?.tips ?? [],
    exercicios, treino: s.treino ?? [],
    resultado: s.expected?.result ?? '', criterios: s.expected?.criteria ?? [],
  };
}
