import type {
  ContentRef, Exercise, ExerciseType, FormatoSessao, FraseAula, Habilidade, Session, SessionKind, TreinoChat, UserData,
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
  /** aula completa ou só uma atividade de exercícios */
  formato: FormatoSessao;
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
    formato: 'aula', date, kind: 'new', title: '', objective: '', whenToUse: '',
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
    ...(r.formato === 'atividade' && { formato: 'atividade' as const }),
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
    id: s.id, formato: s.formato ?? 'aula', date: s.date, kind: s.kind, title: s.title, objective: s.objective ?? '', whenToUse: s.whenToUse ?? '',
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

/**
 * Uma aula de exemplo com todos os campos preenchidos: a mesma que aparece como
 * sugestão dentro de cada campo do editor. Serve para ver o resultado e editar por cima.
 */
export function exemploDeAula(date: string, formato: FormatoSessao = 'aula'): RascunhoAula {
  const exercicios: ExercicioRascunho[] = [
    { type: 'choice', prompt: 'Como se pede a conta?', answer: 'Can I have the bill?', options: 'Can I have the bill? | Can I have the menu? | Can I have a table?', habilidade: 'reconhecer' },
    { type: 'fill', prompt: "I'd like to ____ the chicken, please.", answer: 'order', options: '', habilidade: 'lembrar' },
    { type: 'build', prompt: 'Monte a frase: Pode trazer a conta?', answer: 'Can I have the bill', options: 'Can | I | have | the | bill', habilidade: 'usar' },
    { type: 'match', prompt: 'Ligue as palavras', answer: '', options: 'order = pedir | bill = conta | menu = cardápio', habilidade: 'reconhecer' },
    { type: 'translate', prompt: 'Eu queria a sopa, por favor.', answer: "I'd like the soup, please.", options: '', habilidade: 'lembrar' },
    { type: 'produce', prompt: 'Escreva como você pediria o seu prato favorito.', answer: "I'd like the pasta, please.", options: '', habilidade: 'usar' },
  ];
  const base = rascunhoVazio(date);
  if (formato === 'atividade') {
    return { ...base, formato, kind: 'practice', title: 'Exercícios: pedindo no restaurante', objective: 'Praticar os pedidos e a conta', exercicios };
  }
  return {
    ...base,
    title: 'Pedindo comida no restaurante',
    objective: 'Pedir um prato, uma bebida e a conta com educação',
    whenToUse: 'Em restaurantes, lanchonetes e cafés',
    palavrasNovas: [
      { en: 'order', pt: 'pedir', papel: 'novas', tipo: 'verbo', significado: 'pedir algo num restaurante ou loja', ipa: '/ˈɔːrdər/',
        exemplos: [{ en: 'Can I order now?', pt: 'Posso pedir agora?' }, { en: 'I want to order a pizza.', pt: 'Quero pedir uma pizza.' }, { en: 'Are you ready to order?', pt: 'Pronto para pedir?' }] },
      { en: 'bill', pt: 'conta', papel: 'novas', tipo: 'substantivo', significado: 'o papel com o valor a pagar', ipa: '/bɪl/',
        exemplos: [{ en: 'Can I have the bill?', pt: 'Pode trazer a conta?' }, { en: 'The bill is on the table.', pt: 'A conta está na mesa.' }, { en: 'I will pay the bill.', pt: 'Eu vou pagar a conta.' }] },
    ],
    escuta: [{ en: "I'd like the chicken, please.", pt: 'Eu queria o frango, por favor.' }],
    fala: [{ en: 'Can I have the bill?', pt: 'Pode trazer a conta?' }],
    missao: { situacao: 'Você chega num restaurante em Nova York', tarefas: [{ en: 'A table for two, please.', pt: 'Uma mesa para dois, por favor.' }, { en: "I'd like the soup.", pt: 'Eu queria a sopa.' }] },
    copy: ['order = pedir · bill = conta', "I'd like… = Eu queria… (mais educado que I want)"],
    quiz: ['Como se pede a conta?', 'Como se diz "pedir" em inglês?'],
    practice: 'Escreva o seu pedido completo num restaurante',
    intro: 'Hoje você vai aprender a pedir comida e a conta num restaurante.',
    contexto: 'Num restaurante, falando com o garçom',
    dicas: ['Use "I\'d like" em vez de "I want": soa mais educado'],
    exercicios,
    treino: [{ en: 'What would you like to eat?', pt: 'O que você gostaria de comer?', resposta: "I'd like ____, please." }],
    resultado: 'pedir uma refeição completa e a conta',
    criterios: ['Usa "I\'d like" para pedir', 'Pede a conta sem consultar'],
  };
}
