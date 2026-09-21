import type {
  ContentBundle, ContentRef, Exercise, ExerciseType, ExpectedResult, SessionApp, SessionKind, SessionSheet, UserData,
} from '../types';
import { addDays, weekStartOf } from '../dates';
import { baseContent, parseRef } from '../content/repository';
import { createSession, deleteSession } from '../sessions/sessions';
import { saveDayPlan, saveWeekGoals, KIND_ORDER } from './weeks';

/**
 * PACOTE SEMANAL — um arquivo JSON com tudo o que a semana precisa:
 * conteúdo novo (palavras, expressões, padrões, exemplos, exercícios), o plano de cada dia
 * e, para cada sessão, o que vai para a FOLHA, o que fica no APLICATIVO e o RESULTADO ESPERADO.
 * Formato documentado em docs/formato-semana.md.
 */

export const PACKAGE_FORMAT = 'ingles-hibrido/semana@1';

export interface PackageSession {
  kind: SessionKind;
  title: string;
  objective?: string;
  topic?: string;
  refs: ContentRef[];
  copyRefs?: ContentRef[];
  whenToUse?: string;
  sheet?: SessionSheet;
  app?: SessionApp;
  /** ids de exercícios existentes ou exercícios completos escritos aqui. */
  exercises?: (string | Omit<Exercise, 'id' | 'refs'> & { id?: string; refs?: ContentRef[] })[];
  expected?: ExpectedResult;
}

export interface PackageDay {
  date: string;
  theme?: string;
  objective?: string;
  minutes?: number;
  sessions?: PackageSession[];
}

export interface WeekPackage {
  format: string;
  week: string; // segunda-feira YYYY-MM-DD (outra data da semana também é aceita)
  goals?: string;
  content?: Partial<ContentBundle>;
  days: PackageDay[];
}

export interface PackageCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: { week: string; days: number; sessions: number; content: Record<string, number>; replacesIds: string[] };
}

const KINDS: SessionKind[] = KIND_ORDER;
const EX_TYPES: ExerciseType[] = ['translate', 'fill', 'choice', 'match', 'build', 'qa', 'produce'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_KEYS: (keyof ContentBundle)[] = ['words', 'expressions', 'patterns', 'grammar', 'examples', 'topics', 'exercises'];
const KIND_KEY: Record<string, keyof ContentBundle> = {
  word: 'words', expression: 'expressions', pattern: 'patterns', grammar: 'grammar', topic: 'topics',
};

function known(user: Partial<ContentBundle> | undefined, pkg: Partial<ContentBundle> | undefined) {
  const ids = (k: keyof ContentBundle) =>
    new Set([...(baseContent[k] as { id: string }[]), ...((user?.[k] ?? []) as { id: string }[]), ...((pkg?.[k] ?? []) as { id: string }[])].map((x) => x.id));
  return Object.fromEntries(CONTENT_KEYS.map((k) => [k, ids(k)])) as Record<keyof ContentBundle, Set<string>>;
}

export function parsePackage(text: string): WeekPackage | string {
  try {
    const p = JSON.parse(text);
    if (!p || typeof p !== 'object') return 'O arquivo não contém um objeto JSON.';
    return p as WeekPackage;
  } catch (e) {
    return `JSON inválido: ${(e as Error).message}`;
  }
}

export function checkPackage(data: UserData, p: WeekPackage, opts: { replacePlanned: boolean }): PackageCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (p.format !== PACKAGE_FORMAT) warn(`"format" deveria ser "${PACKAGE_FORMAT}".`);
  if (!p.week || !DATE_RE.test(p.week)) err('"week" deve ser uma data no formato AAAA-MM-DD.');
  const ws = p.week && DATE_RE.test(p.week) ? weekStartOf(p.week) : '';
  if (!Array.isArray(p.days)) err('"days" deve ser uma lista.');

  const ids = known(data.content, p.content);

  // conteúdo
  const c = p.content ?? {};
  for (const k of Object.keys(c)) if (!CONTENT_KEYS.includes(k as keyof ContentBundle)) warn(`content.${k} não é reconhecido e será ignorado.`);
  CONTENT_KEYS.forEach((k) => {
    const list = c[k] as { id?: string }[] | undefined;
    if (list === undefined) return;
    if (!Array.isArray(list)) return err(`content.${k} deve ser uma lista.`);
    const seen = new Set<string>();
    list.forEach((it, i) => {
      if (!it?.id) return err(`content.${k}[${i}] sem "id".`);
      if (seen.has(it.id)) err(`content.${k}: id repetido "${it.id}".`);
      seen.add(it.id);
      if ((baseContent[k] as { id: string }[]).some((b) => b.id === it.id)) warn(`content.${k} "${it.id}" substitui o conteúdo base de mesmo id.`);
    });
  });
  const exampleRefs = (where: string, list?: string[]) =>
    (list ?? []).forEach((e) => { if (!ids.examples.has(e)) err(`${where}: exemplo "${e}" não existe.`); });
  c.words?.forEach((w) => {
    if (!w.word || !w.translations?.length || !w.core_meaning) err(`Palavra "${w.id}": precisa de word, translations e core_meaning.`);
    exampleRefs(`Palavra "${w.id}"`, w.examples);
    w.uses?.forEach((u) => exampleRefs(`Palavra "${w.id}", uso "${u.id}"`, u.examples));
  });
  c.expressions?.forEach((e) => { if (!e.text || !e.translation) err(`Expressão "${e.id}": precisa de text e translation.`); exampleRefs(`Expressão "${e.id}"`, e.examples); });
  c.patterns?.forEach((e) => { if (!e.formula) err(`Padrão "${e.id}": precisa de formula.`); exampleRefs(`Padrão "${e.id}"`, e.examples); });
  c.grammar?.forEach((e) => { if (!e.title) err(`Gramática "${e.id}": precisa de title.`); exampleRefs(`Gramática "${e.id}"`, e.examples); });
  c.examples?.forEach((e) => { if (!e.en || !e.pt) err(`Exemplo "${e.id}": precisa de en e pt.`); });
  c.exercises?.forEach((e) => checkExercise(`Exercício "${e.id}"`, e, err));

  const refOk = (where: string, r: ContentRef) => {
    if (typeof r !== 'string' || !r.includes(':')) return err(`${where}: referência "${r}" inválida (use "word:how", "expression:...", ...).`);
    const { kind, id } = parseRef(r);
    const key = KIND_KEY[kind];
    if (!key) return err(`${where}: tipo "${kind}" desconhecido em "${r}".`);
    if (!ids[key].has(id)) err(`${where}: "${r}" não existe (adicione em content.${key}).`);
  };

  // dias e sessões
  let sessions = 0;
  (p.days ?? []).forEach((d, di) => {
    const where = `Dia ${d?.date ?? di + 1}`;
    if (!d?.date || !DATE_RE.test(d.date)) return err(`days[${di}]: "date" inválida.`);
    if (ws && weekStartOf(d.date) !== ws) err(`${where}: fora da semana ${ws}.`);
    (d.sessions ?? []).forEach((s, si) => {
      sessions++;
      const w = `${where}, sessão ${si + 1} (${s?.title ?? 'sem título'})`;
      if (!s?.title) err(`${w}: falta "title".`);
      if (!KINDS.includes(s?.kind)) err(`${w}: "kind" deve ser ${KINDS.join(', ')}.`);
      if (!Array.isArray(s?.refs) || !s.refs.length) err(`${w}: "refs" precisa ter pelo menos um conteúdo.`);
      s?.refs?.forEach((r) => refOk(w, r));
      s?.copyRefs?.forEach((r) => refOk(`${w}, copyRefs`, r));
      if (s?.topic && !ids.topics.has(s.topic)) err(`${w}: tema "${s.topic}" não existe.`);
      if ((s?.sheet?.copy?.length ?? 0) > 3) warn(`${w}: o Conceito principal tem 3 linhas; só as 3 primeiras de sheet.copy saem na folha.`);
      s?.sheet?.copy?.forEach((l) => l.length > 68 && warn(`${w}: linha de sheet.copy com mais de 68 caracteres será cortada.`));
      if ((s?.sheet?.quiz?.length ?? 0) > 6) warn(`${w}: "Tente sem consultar" tem 6 linhas; só os 6 primeiros itens saem.`);
      if ((s?.whenToUse?.length ?? 0) > 116) warn(`${w}: "whenToUse" longo (máx. ~116 caracteres na folha).`);
      if (s?.expected && !s.expected.result) err(`${w}: "expected.result" é obrigatório quando "expected" existe.`);
      s?.exercises?.forEach((x, xi) => {
        if (typeof x === 'string') { if (!ids.exercises.has(x)) err(`${w}: exercício "${x}" não existe.`); }
        else checkExercise(`${w}, exercício ${xi + 1}`, x as Exercise, err);
      });
    });
  });

  const replacesIds = opts.replacePlanned && ws ? data.sessions.filter((s) => s.weekStart === ws && s.status === 'planned').map((s) => s.id) : [];
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      week: ws, days: p.days?.length ?? 0, sessions,
      content: Object.fromEntries(CONTENT_KEYS.map((k) => [k, (c[k] as unknown[] | undefined)?.length ?? 0]).filter(([, n]) => n)),
      replacesIds,
    },
  };
}

function checkExercise(where: string, e: Partial<Exercise>, err: (m: string) => void) {
  if (!e || !EX_TYPES.includes(e.type as ExerciseType)) return err(`${where}: "type" deve ser ${EX_TYPES.join(', ')}.`);
  if (!e.prompt) err(`${where}: falta "prompt".`);
  if ((e.type === 'choice' || e.type === 'fill') && e.options && !e.options.includes(String(e.answer))) err(`${where}: "answer" precisa estar em "options".`);
  if (e.type === 'match' && !e.pairs?.length) err(`${where}: associação precisa de "pairs".`);
  if (['translate', 'fill', 'choice', 'build', 'qa'].includes(e.type!) && e.answer === undefined) err(`${where}: falta "answer".`);
}

/** Aplica o pacote: salva o conteúdo novo, o plano dos dias e cria as sessões. Retorna os códigos criados. */
export function applyPackage(draft: UserData, p: WeekPackage, opts: { replacePlanned: boolean }): string[] {
  const ws = weekStartOf(p.week);

  // conteúdo do usuário (mesmo id substitui)
  draft.content ??= {};
  const uc = draft.content;
  CONTENT_KEYS.forEach((k) => {
    const list = p.content?.[k] as { id: string }[] | undefined;
    if (!list?.length) return;
    const cur = new Map(((uc[k] ?? []) as { id: string }[]).map((x) => [x.id, x]));
    list.forEach((x) => cur.set(x.id, x));
    (uc as Record<string, unknown[]>)[k] = [...cur.values()];
  });

  if (opts.replacePlanned)
    draft.sessions.filter((s) => s.weekStart === ws && s.status === 'planned').forEach((s) => deleteSession(draft, s.id));

  if (p.goals !== undefined) saveWeekGoals(draft, ws, p.goals);

  const created: string[] = [];
  p.days.forEach((d) => {
    saveDayPlan(draft, d.date, {
      ...(d.theme !== undefined && { theme: d.theme }),
      ...(d.objective !== undefined && { objective: d.objective }),
      ...(d.minutes !== undefined && { minutes: d.minutes }),
    });
    (d.sessions ?? []).forEach((ps) => {
      const s = createSession(draft, {
        date: d.date, kind: ps.kind, topicId: ps.topic, title: ps.title, objective: ps.objective ?? '',
        refs: ps.refs, copyRefs: ps.copyRefs ?? (ps.sheet?.copy ? [] : undefined), whenToUse: ps.whenToUse,
      });
      // exercícios escritos dentro da sessão viram conteúdo do usuário
      const exIds = (ps.exercises ?? []).map((x, i) => {
        if (typeof x === 'string') return x;
        const ex = { ...x, id: x.id ?? `${s.id}-x${i + 1}`, refs: x.refs ?? ps.refs } as Exercise;
        uc.exercises = [...(uc.exercises ?? []).filter((e) => e.id !== ex.id), ex];
        return ex.id;
      });
      s.sheet = ps.sheet;
      s.app = ps.app;
      s.expected = ps.expected;
      if (exIds.length) s.exerciseIds = exIds;
      created.push(s.id);
    });
  });
  return created;
}

/** Exporta uma semana no mesmo formato (para editar fora e importar de novo). */
export function exportPackage(data: UserData, weekStart: string): WeekPackage {
  const week = data.weeks.find((w) => w.id === weekStart);
  const sessions = data.sessions.filter((s) => s.weekStart === weekStart);
  const usedRefs = new Set(sessions.flatMap((s) => [...s.refs, ...s.copyRefs]));
  const usedEx = new Set(sessions.flatMap((s) => s.exerciseIds ?? []));
  const uc = data.content ?? {};
  const pick = <T extends { id: string }>(list: T[] | undefined, keep: (x: T) => boolean) => (list ?? []).filter(keep);
  const content: Partial<ContentBundle> = {
    words: pick(uc.words, (x) => usedRefs.has(`word:${x.id}`)),
    expressions: pick(uc.expressions, (x) => usedRefs.has(`expression:${x.id}`)),
    patterns: pick(uc.patterns, (x) => usedRefs.has(`pattern:${x.id}`)),
    grammar: pick(uc.grammar, (x) => usedRefs.has(`grammar:${x.id}`)),
    exercises: pick(uc.exercises, (x) => usedEx.has(x.id)),
    examples: uc.examples ?? [],
  };
  (Object.keys(content) as (keyof ContentBundle)[]).forEach((k) => !(content[k] as unknown[]).length && delete content[k]);

  return {
    format: PACKAGE_FORMAT,
    week: weekStart,
    goals: week?.goals ?? '',
    ...(Object.keys(content).length && { content }),
    days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((date) => {
      const plan = week?.days.find((x) => x.date === date);
      return {
        date,
        theme: plan?.theme ?? '',
        objective: plan?.objective ?? '',
        ...(plan?.minutes && { minutes: plan.minutes }),
        sessions: sessions.filter((s) => s.date === date).map((s) => ({
          kind: s.kind, title: s.title, objective: s.objective,
          ...(s.topicId && { topic: s.topicId }),
          refs: s.refs, copyRefs: s.copyRefs,
          ...(s.whenToUse && { whenToUse: s.whenToUse }),
          ...(s.sheet && { sheet: s.sheet }),
          ...(s.app && { app: s.app }),
          ...(s.exerciseIds && { exercises: s.exerciseIds }),
          ...(s.expected && { expected: s.expected }),
        })),
      };
    }),
  };
}

/** Modelo comentado para começar uma semana nova. */
export function templatePackage(weekStart: string): WeekPackage & { $leia_me: string[] } {
  return {
    $leia_me: [
      'Pacote semanal do Inglês Híbrido. Campos que começam com $ são ignorados.',
      'content: conteúdo NOVO da semana (mesmo formato dos arquivos em /content). Pode referenciar o conteúdo que já existe.',
      'refs: conteúdos estudados na sessão — "word:id", "expression:id", "pattern:id", "grammar:id".',
      'sheet: o que vai para a FOLHA (copy = Conceito principal, até 3 linhas; quiz = Tente sem consultar, até 6; practice = instrução da Minha prática).',
      'app: o que fica SÓ NO APLICATIVO (intro, context, tips). A explicação completa, os exemplos e as variações vêm do conteúdo em refs.',
      'exercises: ids de exercícios existentes ou exercícios completos (type: translate, fill, choice, match, build, qa, produce).',
      'expected: o resultado que o aluno deve conseguir ao final (result + criteria). Aparece na aula e na avaliação.',
      'kind: new (novo conteúdo), practice, review, reinforce, consolidate — nessa ordem ao longo da semana.',
    ],
    format: PACKAGE_FORMAT,
    week: weekStart,
    goals: 'Fazer e responder perguntas de apresentação.',
    content: {
      examples: [
        { id: 'ex-where-do-you-work', en: 'Where do you work?', pt: 'Onde você trabalha?', context: 'trabalho' },
        { id: 'ex-i-work-at-home', en: 'I work at home.', pt: 'Eu trabalho em casa.', context: 'resposta' },
      ],
      words: [
        {
          id: 'work', word: 'work', type: 'verb / noun',
          translations: [{ text: 'trabalhar', context: 'verbo' }, { text: 'trabalho', context: 'substantivo' }],
          core_meaning: 'Realizar uma atividade profissional; também o próprio trabalho.',
          uses: [{ id: 'verb', label: 'verbo', meaning: 'trabalhar', explanation: 'Com do nas perguntas: Where do you work?', examples: ['ex-where-do-you-work', 'ex-i-work-at-home'] }],
          variations: [{ form: 'at work', meaning: 'no trabalho' }],
          related_words: ['where', 'do'],
          examples: ['ex-where-do-you-work'],
          pronunciation: { ipa: '/wɜːrk/', respelling: 'uârk' },
          copy: { lines: ['work = trabalhar / trabalho', 'Where do you work? — Onde você trabalha?'] },
        },
      ],
    },
    days: [
      {
        date: weekStart, theme: 'Perguntas básicas', objective: 'Perguntar como alguém está', minutes: 20,
        sessions: [
          {
            kind: 'new', title: 'Perguntas com How', objective: 'Perguntar e responder como alguém está.',
            refs: ['word:how', 'expression:how-are-you', 'pattern:how-be-subject'],
            whenToUse: 'Use how para perguntar como alguém está ou como algo é feito.',
            sheet: {
              copy: ['How = como', 'How + are/is + sujeito?', 'How are you? — Como você está?'],
              quiz: ['Como você está? →', 'Como eles estão? →', 'Como ela está? →', 'Estou bem, obrigado. →', 'Quanto custa? →', 'Como se diz isso em inglês? →'],
              practice: 'Escreva 5 perguntas com How para pessoas da sua família.',
            },
            app: {
              intro: 'How é a palavra de pergunta para estado e maneira.',
              context: 'Você encontra um colega no trabalho e quer saber como ele está.',
              tips: ['Em inglês, o verbo be vem antes do sujeito na pergunta.'],
            },
            exercises: [
              'x-qa-how-are-you',
              { type: 'choice', prompt: 'How ___ they?', options: ['is', 'are', 'am'], answer: 'are' },
              { type: 'produce', prompt: 'Escreva como você responderia a "How are you?" em 3 situações.' },
            ],
            expected: {
              result: 'Perguntar e responder como alguém está usando How + be + sujeito.',
              criteria: ['Usa are/is corretamente com o sujeito', 'Responde com I am... / I\'m...', 'Faz a pergunta sem consultar'],
            },
          },
        ],
      },
      {
        date: addDays(weekStart, 1), theme: 'Trabalho', objective: 'Perguntar onde a pessoa trabalha', minutes: 20,
        sessions: [
          {
            kind: 'new', title: 'Where do you work?',
            refs: ['word:work', 'word:where', 'word:do', 'pattern:wh-do-subject-verb'],
            copyRefs: ['word:work'],
            expected: { result: 'Perguntar e dizer onde trabalha.' },
          },
        ],
      },
      {
        date: addDays(weekStart, 4), theme: 'Revisão da semana', minutes: 30,
        sessions: [
          { kind: 'review', title: 'Revisão: perguntas', refs: ['expression:how-are-you', 'word:work'], expected: { result: 'Usar as perguntas da semana sem consultar.' } },
        ],
      },
    ],
  };
}
