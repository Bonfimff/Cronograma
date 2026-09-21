import type {
  ContentBundle, ContentRef, Exercise, ExerciseType, ExpectedResult, Session, SessionApp, SessionKind, SessionSheet,
  SessionStatus, SheetItem, UserData,
} from '../types';
import { addDays, weekStartOf } from '../dates';
import { baseContent, parseRef } from '../content/repository';
import { normalizeContent } from '../content/normalize';
import { mergeSheets } from '../library/sheets';
import { createSession, deleteSession } from '../sessions/sessions';
import { saveDayPlan, saveWeekGoals, KIND_ORDER } from './weeks';

/**
 * PACOTE SEMANAL — um arquivo JSON com tudo o que a semana precisa:
 * conteúdo novo (palavras, expressões, padrões, exemplos, exercícios), folhas da
 * Biblioteca, o plano de cada dia e, para cada sessão, o que vai para a FOLHA, o
 * que fica no APLICATIVO e o RESULTADO ESPERADO.
 * Formato documentado em docs/formato-semana.md.
 */

export const PACKAGE_FORMAT = 'ingles-hibrido/semana@1';

export interface PackageSession {
  /**
   * Código da sessão (ENG-2026-0001). Vem na semana exportada: ao reimportar, a
   * sessão de mesmo código é atualizada no lugar — o código impresso na folha
   * continua valendo. Sessão já iniciada ou feita não é alterada. Sem id = nova.
   */
  id?: string;
  /** Só informativo (vem na exportação); é ignorado na importação. */
  status?: SessionStatus;
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

/** Folha da Biblioteca dentro do pacote: mesmo título soma na folha que já existe. */
export interface PackageSheet {
  title: string;
  items: SheetItem[];
}

export interface WeekPackage {
  format: string;
  week: string; // segunda-feira YYYY-MM-DD (outra data da semana também é aceita)
  goals?: string;
  content?: Partial<ContentBundle>;
  sheets?: PackageSheet[];
  days: PackageDay[];
}

/** O que a importação vai fazer com as sessões — calculado igual na prévia e na aplicação. */
export interface SessionPlan {
  create: number;
  update: string[]; // sessões planejadas atualizadas no lugar (mesmo código)
  keep: string[]; // sessões já iniciadas/feitas que o arquivo cita: ficam como estão
  remove: string[]; // planejadas da semana que não estão no arquivo (com "substituir")
}

export interface PackageCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: { week: string; days: number; sessions: number; content: Record<string, number>; sheets: number; plan: SessionPlan };
}

const KINDS: SessionKind[] = KIND_ORDER;
const EX_TYPES: ExerciseType[] = ['translate', 'fill', 'choice', 'match', 'build', 'qa', 'produce'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONTENT_KEYS: (keyof ContentBundle)[] = ['words', 'expressions', 'patterns', 'grammar', 'examples', 'topics', 'exercises'];
const KIND_KEY: Record<string, keyof ContentBundle> = {
  word: 'words', expression: 'expressions', pattern: 'patterns', grammar: 'grammar', topic: 'topics',
};

/** Data que existe no calendário (31/02 não passa). */
export const isDate = (v: unknown): v is string =>
  typeof v === 'string' && DATE_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && v.trim() !== '';
/** Lista do pacote: devolve [] (e registra erro) quando o campo existe mas não é lista. */
const listOf = <T>(v: unknown, where: string, err: (m: string) => void): T[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) { err(`${where} deve ser uma lista.`); return []; }
  return v as T[];
};

function known(user: Partial<ContentBundle> | undefined, pkg: Partial<ContentBundle> | undefined) {
  const ids = (k: keyof ContentBundle) => {
    const from = (l: unknown) => (Array.isArray(l) ? l : []).filter(isObj).map((x) => x.id);
    return new Set([...(baseContent[k] as { id: string }[]).map((x) => x.id), ...from(user?.[k]), ...from(pkg?.[k])]);
  };
  return Object.fromEntries(CONTENT_KEYS.map((k) => [k, ids(k)])) as Record<keyof ContentBundle, Set<unknown>>;
}

export function parsePackage(text: string): WeekPackage | string {
  try {
    const p = JSON.parse(text);
    if (!isObj(p)) return 'O arquivo precisa ser um objeto JSON ({ ... }), não uma lista ou um valor solto.';
    return p as unknown as WeekPackage;
  } catch (e) {
    return `JSON inválido: ${(e as Error).message}`;
  }
}

/** Sessões do pacote, achatadas, com a data do dia — só as que têm formato de objeto. */
function packageSessions(p: WeekPackage): { date: string; s: PackageSession }[] {
  const days = Array.isArray(p.days) ? p.days.filter(isObj) : [];
  return days.flatMap((d) => (Array.isArray(d.sessions) ? d.sessions.filter(isObj) : []).map((s) => ({ date: d.date, s })));
}

/** Plano das sessões: o que é criado, atualizado, mantido e removido. */
export function planSessions(data: UserData, p: WeekPackage, replacePlanned: boolean): SessionPlan {
  const ws = isDate(p.week) ? weekStartOf(p.week) : '';
  const byId = new Map(data.sessions.map((s) => [s.id, s]));
  const plan: SessionPlan = { create: 0, update: [], keep: [], remove: [] };
  const cited = new Set<string>();
  packageSessions(p).forEach(({ s }) => {
    const cur = typeof s.id === 'string' ? byId.get(s.id) : undefined;
    if (!cur) plan.create++;
    else {
      cited.add(cur.id);
      (cur.status === 'planned' ? plan.update : plan.keep).push(cur.id);
    }
  });
  if (replacePlanned && ws) {
    plan.remove = data.sessions.filter((s) => s.weekStart === ws && s.status === 'planned' && !cited.has(s.id)).map((s) => s.id);
  }
  return plan;
}

export function checkPackage(data: UserData, p: WeekPackage, opts: { replacePlanned: boolean }): PackageCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);

  if (p.format !== PACKAGE_FORMAT) warn(`"format" deveria ser "${PACKAGE_FORMAT}".`);
  if (!isDate(p.week)) err('"week" deve ser uma data que existe, no formato AAAA-MM-DD.');
  const ws = isDate(p.week) ? weekStartOf(p.week) : '';
  if (!Array.isArray(p.days)) err('"days" deve ser uma lista.');
  if (p.goals !== undefined && typeof p.goals !== 'string') err('"goals" deve ser um texto.');

  // ---- conteúdo
  const c = (isObj(p.content) ? p.content : {}) as Record<string, unknown>;
  if (p.content !== undefined && !isObj(p.content)) err('"content" deve ser um objeto ({ words: [...], ... }).');
  for (const k of Object.keys(c)) if (!CONTENT_KEYS.includes(k as keyof ContentBundle) && !k.startsWith('$')) warn(`content.${k} não é reconhecido e será ignorado.`);
  const lists = Object.fromEntries(CONTENT_KEYS.map((k) => [k, listOf<Record<string, unknown>>(c[k], `content.${k}`, err)])) as Record<keyof ContentBundle, Record<string, unknown>[]>;
  const ids = known(data.content, lists as unknown as Partial<ContentBundle>);

  CONTENT_KEYS.forEach((k) => {
    const seen = new Set<unknown>();
    lists[k].forEach((it, i) => {
      if (!isObj(it)) return err(`content.${k}[${i}] deve ser um objeto.`);
      if (!text(it.id)) return err(`content.${k}[${i}] sem "id".`);
      if (seen.has(it.id)) err(`content.${k}: id repetido "${it.id}".`);
      seen.add(it.id);
      if ((baseContent[k] as { id: string }[]).some((b) => b.id === it.id)) warn(`content.${k} "${it.id}" substitui o conteúdo base de mesmo id.`);
    });
  });
  const exampleRefs = (where: string, l: unknown) =>
    listOf<unknown>(l, `${where}: examples`, err).forEach((e) => { if (!ids.examples.has(e)) err(`${where}: exemplo "${e}" não existe.`); });
  const refOk = (where: string, r: unknown) => {
    if (typeof r !== 'string' || !r.includes(':')) return err(`${where}: referência "${String(r)}" inválida (use "word:how", "expression:...", ...).`);
    const { kind, id } = parseRef(r as ContentRef);
    const key = KIND_KEY[kind];
    if (!key) return err(`${where}: tipo "${kind}" desconhecido em "${r}".`);
    if (!ids[key].has(id)) err(`${where}: "${r}" não existe (adicione em content.${key}).`);
  };

  lists.words.filter(isObj).forEach((w) => {
    const where = `Palavra "${w.id}"`;
    const tr = listOf<Record<string, unknown>>(w.translations, `${where}: translations`, err);
    if (!text(w.word) || !tr.some((t) => isObj(t) && text(t.text)) || !text(w.core_meaning)) {
      err(`${where}: precisa de word, translations (com text) e core_meaning.`);
    }
    if (!isObj(w.pronunciation) || !text(w.pronunciation.ipa)) warn(`${where}: sem pronunciation.ipa — o flashcard e o verbete ficam sem a pronúncia.`);
    exampleRefs(where, w.examples);
    listOf<Record<string, unknown>>(w.uses, `${where}: uses`, err).filter(isObj).forEach((u) => exampleRefs(`${where}, uso "${u.id}"`, u.examples));
    listOf<Record<string, unknown>>(w.variations, `${where}: variations`, err).filter(isObj).forEach((v) => {
      if (!text(v.form) || !text(v.meaning)) err(`${where}: cada variação precisa de form e meaning.`);
      if (v.ref !== undefined) refOk(`${where}, variação "${v.form}"`, v.ref);
    });
  });
  lists.expressions.filter(isObj).forEach((e) => {
    const where = `Expressão "${e.id}"`;
    if (!text(e.text) || !text(e.translation)) err(`${where}: precisa de text e translation.`);
    listOf<unknown>(e.words, `${where}: words`, err).forEach((w) => { if (!ids.words.has(w)) warn(`${where}: palavra "${w}" não existe (o link fica sem destino).`); });
    if (e.pattern !== undefined && !ids.patterns.has(e.pattern)) warn(`${where}: padrão "${e.pattern}" não existe.`);
    exampleRefs(where, e.examples);
  });
  lists.patterns.filter(isObj).forEach((x) => { if (!text(x.formula)) err(`Padrão "${x.id}": precisa de formula.`); exampleRefs(`Padrão "${x.id}"`, x.examples); });
  lists.grammar.filter(isObj).forEach((x) => { if (!text(x.title)) err(`Gramática "${x.id}": precisa de title.`); exampleRefs(`Gramática "${x.id}"`, x.examples); });
  lists.examples.filter(isObj).forEach((x) => { if (!text(x.en) || !text(x.pt)) err(`Exemplo "${x.id}": precisa de en e pt.`); });
  lists.topics.filter(isObj).forEach((t) => {
    if (!text(t.title)) err(`Tema "${t.id}": precisa de title.`);
    listOf<unknown>(t.refs, `Tema "${t.id}": refs`, err).forEach((r) => refOk(`Tema "${t.id}"`, r));
  });
  lists.exercises.filter(isObj).forEach((x) => checkExercise(`Exercício "${x.id}"`, x as Partial<Exercise>, err));

  // ---- folhas da Biblioteca
  const sheets = listOf<Record<string, unknown>>(p.sheets, '"sheets"', err);
  sheets.forEach((s, i) => {
    if (!isObj(s) || !text(s.title)) return err(`sheets[${i}]: precisa de "title".`);
    listOf<Record<string, unknown>>(s.items, `Folha "${s.title}": items`, err).forEach((it, j) => {
      if (!isObj(it) || !text(it.en) || !text(it.pt)) err(`Folha "${s.title}", item ${j + 1}: precisa de "en" e "pt".`);
    });
  });

  // ---- dias e sessões
  const plan = planSessions(data, p, opts.replacePlanned);
  const byId = new Map(data.sessions.map((s) => [s.id, s]));
  const idsInFile = new Set<string>();
  let sessions = 0;
  (Array.isArray(p.days) ? p.days : []).forEach((d, di) => {
    if (!isObj(d)) return err(`days[${di}] deve ser um objeto.`);
    const where = `Dia ${isDate(d.date) ? d.date : di + 1}`;
    if (!isDate(d.date)) return err(`days[${di}]: "date" inválida (AAAA-MM-DD, data que existe).`);
    if (ws && weekStartOf(d.date) !== ws) err(`${where}: fora da semana ${ws}.`);
    if (d.minutes !== undefined && (typeof d.minutes !== 'number' || d.minutes < 0)) err(`${where}: "minutes" deve ser um número.`);
    listOf<PackageSession>(d.sessions, `${where}: sessions`, err).forEach((s, si) => {
      sessions++;
      if (!isObj(s)) return err(`${where}, sessão ${si + 1}: deve ser um objeto.`);
      const w = `${where}, sessão ${si + 1} (${s.title ?? 'sem título'})`;
      if (!text(s.title)) err(`${w}: falta "title".`);
      if (!KINDS.includes(s.kind)) err(`${w}: "kind" deve ser ${KINDS.join(', ')}.`);
      const refs = listOf<unknown>(s.refs, `${w}: refs`, err);
      if (!refs.length) err(`${w}: "refs" precisa ter pelo menos um conteúdo.`);
      refs.forEach((r) => refOk(w, r));
      listOf<unknown>(s.copyRefs, `${w}: copyRefs`, err).forEach((r) => refOk(`${w}, copyRefs`, r));
      if (s.topic !== undefined && !ids.topics.has(s.topic)) err(`${w}: tema "${s.topic}" não existe.`);
      if (s.id !== undefined) {
        if (typeof s.id !== 'string') err(`${w}: "id" deve ser o código da sessão (ex.: ENG-2026-0001).`);
        else {
          if (idsInFile.has(s.id)) err(`${w}: código "${s.id}" repetido no arquivo.`);
          idsInFile.add(s.id);
          const cur = byId.get(s.id);
          if (!cur) warn(`${w}: o código ${s.id} não existe aqui — a sessão será criada com código novo.`);
          else if (cur.status !== 'planned') warn(`${w}: ${s.id} já foi ${cur.status === 'done' ? 'feita' : 'iniciada'} — fica como está.`);
          else if (cur.weekStart !== ws) warn(`${w}: ${s.id} muda da semana ${cur.weekStart} para esta.`);
        }
      }
      const sheet = isObj(s.sheet) ? s.sheet : undefined;
      if (s.sheet !== undefined && !sheet) err(`${w}: "sheet" deve ser um objeto.`);
      const copy = listOf<string>(sheet?.copy, `${w}: sheet.copy`, err);
      const quiz = listOf<string>(sheet?.quiz, `${w}: sheet.quiz`, err);
      if (copy.length > 3) warn(`${w}: o Conceito principal tem 3 linhas; só as 3 primeiras de sheet.copy saem na folha.`);
      copy.forEach((l) => typeof l === 'string' && l.length > 68 && warn(`${w}: linha de sheet.copy com mais de 68 caracteres será cortada.`));
      if (quiz.length > 6) warn(`${w}: "Tente sem consultar" tem 6 linhas; só os 6 primeiros itens saem.`);
      if ((s.whenToUse?.length ?? 0) > 116) warn(`${w}: "whenToUse" longo (máx. ~116 caracteres na folha).`);
      if (s.app !== undefined && !isObj(s.app)) err(`${w}: "app" deve ser um objeto.`);
      if (isObj(s.app)) listOf<string>(s.app.tips, `${w}: app.tips`, err);
      if (s.expected !== undefined) {
        if (!isObj(s.expected) || !text(s.expected.result)) err(`${w}: "expected.result" é obrigatório quando "expected" existe.`);
        else listOf<string>(s.expected.criteria, `${w}: expected.criteria`, err);
      }
      listOf<unknown>(s.exercises, `${w}: exercises`, err).forEach((x, xi) => {
        if (typeof x === 'string') { if (!ids.exercises.has(x)) err(`${w}: exercício "${x}" não existe.`); }
        else checkExercise(`${w}, exercício ${xi + 1}`, x as Partial<Exercise>, err);
      });
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      week: ws,
      days: Array.isArray(p.days) ? p.days.length : 0,
      sessions,
      content: Object.fromEntries(CONTENT_KEYS.map((k) => [k, lists[k].length]).filter(([, n]) => n)),
      sheets: sheets.length,
      plan,
    },
  };
}

function checkExercise(where: string, e: Partial<Exercise>, err: (m: string) => void) {
  if (!isObj(e) || !EX_TYPES.includes(e.type as ExerciseType)) return err(`${where}: "type" deve ser ${EX_TYPES.join(', ')}.`);
  if (!e.prompt) err(`${where}: falta "prompt".`);
  if (e.options !== undefined && !Array.isArray(e.options)) return err(`${where}: "options" deve ser uma lista.`);
  if ((e.type === 'choice' || e.type === 'fill') && e.options && !e.options.includes(String(e.answer))) err(`${where}: "answer" precisa estar em "options".`);
  if (e.type === 'match' && !(Array.isArray(e.pairs) && e.pairs.length)) err(`${where}: associação precisa de "pairs".`);
  if (['translate', 'fill', 'choice', 'build', 'qa'].includes(e.type!) && e.answer === undefined) err(`${where}: falta "answer".`);
}

export interface ApplyResult {
  created: string[];
  updated: string[];
  kept: string[];
  removed: string[];
}

/**
 * Aplica o pacote: salva o conteúdo novo (completado com os campos opcionais),
 * junta as folhas da Biblioteca, grava o plano dos dias e cria/atualiza as
 * sessões conforme o plano. Só chame depois de checkPackage dar ok.
 */
export function applyPackage(draft: UserData, p: WeekPackage, opts: { replacePlanned: boolean }): ApplyResult {
  const ws = weekStartOf(p.week);
  const plan = planSessions(draft, p, opts.replacePlanned);

  // conteúdo do usuário (mesmo id substitui)
  draft.content ??= {};
  const uc = draft.content;
  const incoming = normalizeContent(p.content);
  CONTENT_KEYS.forEach((k) => {
    const list = incoming[k] as { id: string }[] | undefined;
    if (!list?.length) return;
    const cur = new Map(((uc[k] ?? []) as { id: string }[]).map((x) => [x.id, x]));
    list.forEach((x) => cur.set(x.id, x));
    (uc as Record<string, unknown[]>)[k] = [...cur.values()];
  });

  if (p.sheets?.length) mergeSheets(draft, p.sheets);

  plan.remove.forEach((id) => deleteSession(draft, id));
  if (p.goals !== undefined) saveWeekGoals(draft, ws, p.goals);

  const result: ApplyResult = { created: [], updated: [], kept: [...plan.keep], removed: [...plan.remove] };
  const byId = new Map(draft.sessions.map((s) => [s.id, s]));
  p.days.forEach((d) => {
    saveDayPlan(draft, d.date, {
      ...(d.theme !== undefined && { theme: d.theme }),
      ...(d.objective !== undefined && { objective: d.objective }),
      ...(d.minutes !== undefined && { minutes: d.minutes }),
    });
    (d.sessions ?? []).forEach((ps) => {
      const cur = ps.id ? byId.get(ps.id) : undefined;
      if (cur && cur.status !== 'planned') return; // já iniciada/feita: não mexe

      let s: Session;
      if (cur) {
        // mesma sessão, mesmo código: atualiza no lugar (a folha impressa continua valendo)
        Object.assign(cur, {
          date: d.date, weekStart: weekStartOf(d.date), kind: ps.kind, topicId: ps.topic,
          title: ps.title, objective: ps.objective ?? '', refs: ps.refs,
          copyRefs: ps.copyRefs ?? cur.copyRefs, whenToUse: ps.whenToUse || undefined,
        });
        s = cur;
        result.updated.push(s.id);
      } else {
        s = createSession(draft, {
          date: d.date, kind: ps.kind, topicId: ps.topic, title: ps.title, objective: ps.objective ?? '',
          refs: ps.refs, copyRefs: ps.copyRefs ?? (ps.sheet?.copy ? [] : undefined), whenToUse: ps.whenToUse,
        });
        result.created.push(s.id);
      }
      // exercícios escritos dentro da sessão viram conteúdo do usuário
      const exIds = (ps.exercises ?? []).map((x, i) => {
        if (typeof x === 'string') return x;
        const ex = normalizeContent({ exercises: [{ ...x, id: x.id ?? `${s.id}-x${i + 1}`, refs: x.refs ?? ps.refs } as Exercise] }).exercises![0];
        uc.exercises = [...(uc.exercises ?? []).filter((e) => e.id !== ex.id), ex];
        return ex.id;
      });
      s.sheet = ps.sheet;
      s.app = ps.app;
      s.expected = ps.expected;
      s.exerciseIds = exIds.length ? exIds : undefined;
    });
  });
  return result;
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
          id: s.id,
          status: s.status,
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
      'id (na sessão): código da sessão, vem na semana exportada. Reimportando, a sessão de mesmo código é atualizada no lugar (a folha impressa continua valendo); sem id = sessão nova.',
      'sheets: folhas da Biblioteca (title + items com en/pt). Mesmo título soma na folha que já existe.',
      'goals: objetivos da semana — saem no campo de anotações da folha semanal impressa.',
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
    sheets: [
      { title: 'Trabalho', items: [{ en: 'office', pt: 'escritório' }, { en: 'boss', pt: 'chefe' }] },
    ],
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
