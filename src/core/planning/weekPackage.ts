import type {
  AulaDaSessao, ContentBundle, ContentRef, Exercise, ExerciseType, ExpectedResult, Habilidade, PalavrasDaSessao, Session,
  SessionApp, SessionKind, SessionSheet, SessionStatus, SheetItem, TreinoChat, UserData,
} from '../types';
import { addDays, weekStartOf } from '../dates';
import { baseContent, examplesFor, parseRef } from '../content/repository';
import { contextoDoAluno, type ContextoAluno } from './contextoAluno';
import { adicionarTexto, cobertura } from './cobertura';
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

export const PACKAGE_FORMAT = 'ingles-hibrido/semana@2';
/** @1 continua valendo: os campos novos do @2 são todos opcionais. */
export const FORMATOS_ACEITOS = ['ingles-hibrido/semana@1', PACKAGE_FORMAT];
const HABILIDADES: Habilidade[] = ['reconhecer', 'lembrar', 'ouvir', 'falar', 'usar'];
/** Cobertura mínima de palavras conhecidas numa aula (Hu & Nation: 95% a 98%). */
export const COBERTURA_MINIMA = 0.95;
/** Quantas vezes, em sessões diferentes, uma palavra nova deveria aparecer na semana. */
export const REPETICOES_NA_SEMANA = 3;

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
  /** conteúdos da sessão; no @2 pode faltar quando há palavras.novas (vira novas + revisar) */
  refs?: ContentRef[];
  palavras?: PalavrasDaSessao;
  aula?: AulaDaSessao;
  chat?: { treino?: (string | TreinoChat)[] };
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
  /** o que o aluno já sabe (gerado pelo app; ignorado na importação) */
  aluno?: ContextoAluno;
  week?: string; // segunda-feira YYYY-MM-DD (outra data da semana também é aceita); opcional
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

/** Uma linha da conferência com o vocabulário do aluno: ok ou um alerta, com o porquê. */
export interface Integracao {
  ok: boolean;
  texto: string;
}

export interface PackageCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** cobertura de palavras conhecidas, repetição das novas, revisão das quase esquecidas, habilidades */
  integracao: Integracao[];
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

/**
 * A semana do arquivo: "week" quando vem, senão a do primeiro dia. Um arquivo só com a
 * aula de quinta (sem "week") é aceito: mexe só naquele dia, o resto fica como está.
 */
export function semanaDoPacote(p: WeekPackage): string {
  if (isDate(p.week)) return weekStartOf(p.week);
  const dia = (Array.isArray(p.days) ? p.days : []).find((d) => isObj(d) && isDate(d.date));
  return dia ? weekStartOf(dia.date) : '';
}

const mesmoTitulo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A sessão do aparelho que esta sessão do arquivo atualiza: pelo código (id) ou, sem código,
 * pela mesma data e o mesmo título. Assim, reenviar só uma aula corrige aquela aula em vez de
 * criar outra igual ao lado.
 */
function sessaoCorrespondente(data: UserData, date: string, s: PackageSession, usados: Set<string>): Session | undefined {
  if (typeof s.id === 'string') return data.sessions.find((x) => x.id === s.id);
  if (typeof s.title !== 'string') return undefined;
  return data.sessions.find((x) => x.date === date && !usados.has(x.id) && mesmoTitulo(x.title, s.title));
}

/** Plano das sessões: o que é criado, atualizado, mantido e removido. */
export function planSessions(data: UserData, p: WeekPackage, replacePlanned: boolean): SessionPlan {
  const plan: SessionPlan = { create: 0, update: [], keep: [], remove: [] };
  const cited = new Set<string>();
  packageSessions(p).forEach(({ date, s }) => {
    const cur = sessaoCorrespondente(data, date, s, cited);
    if (!cur) plan.create++;
    else {
      cited.add(cur.id);
      (cur.status === 'planned' ? plan.update : plan.keep).push(cur.id);
    }
  });
  // "substituir": só nos dias que vieram no arquivo; os outros dias ficam intactos
  if (replacePlanned) {
    const dias = new Set(packageSessions(p).map((x) => x.date).concat((Array.isArray(p.days) ? p.days : []).filter(isObj).map((d) => d.date)));
    plan.remove = data.sessions.filter((s) => dias.has(s.date) && s.status === 'planned' && !cited.has(s.id)).map((s) => s.id);
  }
  return plan;
}

export function checkPackage(data: UserData, p: WeekPackage, opts: { replacePlanned: boolean }): PackageCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);
  const integracao: Integracao[] = [];

  if (!FORMATOS_ACEITOS.includes(p.format)) warn(`"format" deveria ser "${PACKAGE_FORMAT}".`);
  // "week" é opcional: sem ele, o arquivo traz só os dias que vai mudar (uma aula avulsa, por exemplo)
  if (p.week !== undefined && !isDate(p.week)) err('"week" deve ser uma data que existe, no formato AAAA-MM-DD (ou fique de fora).');
  const ws = isDate(p.week) ? weekStartOf(p.week) : '';
  if (!ws && !semanaDoPacote(p)) err('Sem "week", pelo menos um dia precisa de "date".');
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
    if (!isObj(w.pronunciation) || !text(w.pronunciation.ipa)) warn(`${where}: sem pronunciation.ipa, então o flashcard e o verbete ficam sem a pronúncia.`);
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
  const datas = (Array.isArray(p.days) ? p.days : []).filter(isObj).map((d) => d.date);
  if (datas.length && datas.length < 7) {
    warn(`Só ${datas.length === 1 ? 'o dia' : 'os dias'} ${datas.filter(isDate).map((d) => d.split('-').reverse().slice(0, 2).join('/')).join(', ')} ${datas.length === 1 ? 'muda' : 'mudam'}; os outros dias ficam como estão.`);
  }
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
      const pal = isObj(s.palavras) ? s.palavras : undefined;
      if (s.palavras !== undefined && !pal) err(`${w}: "palavras" deve ser um objeto ({ novas, revisar, apoio }).`);
      const novas = listOf<unknown>(pal?.novas, `${w}: palavras.novas`, err);
      (['novas', 'revisar', 'apoio'] as const).forEach((k) => listOf<unknown>(pal?.[k], `${w}: palavras.${k}`, err).forEach((r) => refOk(`${w}, palavras.${k}`, r)));
      if (novas.length > 4) warn(`${w}: ${novas.length} palavras novas; a aula mostra até 4 em cartões, o resto vai para "Saiba mais".`);
      if (!refs.length && !novas.length) err(`${w}: precisa de "refs" ou de "palavras.novas" com pelo menos um conteúdo.`);
      refs.forEach((r) => refOk(w, r));
      checkAula(w, s.aula, err, refOk);
      if (s.chat !== undefined) {
        if (!isObj(s.chat)) err(`${w}: "chat" deve ser um objeto ({ treino: [...] }).`);
        else listOf<unknown>(s.chat.treino, `${w}: chat.treino`, err).forEach((t, ti) => {
          if (typeof t === 'string') return;
          if (!isObj(t) || !text(t.en)) err(`${w}, chat.treino ${ti + 1}: precisa de "en" (a pergunta em inglês).`);
        });
      }
      listOf<unknown>(s.copyRefs, `${w}: copyRefs`, err).forEach((r) => refOk(`${w}, copyRefs`, r));
      if (s.topic !== undefined && !ids.topics.has(s.topic)) err(`${w}: tema "${s.topic}" não existe.`);
      if (s.id !== undefined) {
        if (typeof s.id !== 'string') err(`${w}: "id" deve ser o código da sessão (ex.: ENG-2026-0001).`);
        else {
          if (idsInFile.has(s.id)) err(`${w}: código "${s.id}" repetido no arquivo.`);
          idsInFile.add(s.id);
          const cur = byId.get(s.id);
          if (!cur) warn(`${w}: o código ${s.id} não existe aqui, então a sessão será criada com código novo.`);
          else if (cur.status !== 'planned') warn(`${w}: ${s.id} já foi ${cur.status === 'done' ? 'feita' : 'iniciada'}, fica como está.`);
          else if (ws && cur.weekStart !== ws) warn(`${w}: ${s.id} muda da semana ${cur.weekStart} para esta.`);
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

  if (!errors.length) integracao.push(...conferirIntegracao(data, p, lists));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    integracao,
    summary: {
      week: ws || semanaDoPacote(p),
      days: Array.isArray(p.days) ? p.days.length : 0,
      sessions,
      content: Object.fromEntries(CONTENT_KEYS.map((k) => [k, lists[k].length]).filter(([, n]) => n)),
      sheets: sheets.length,
      plan,
    },
  };
}

const refsDaSessao = (s: PackageSession): ContentRef[] =>
  [...new Set([...(s.refs ?? []), ...(s.palavras?.novas ?? []), ...(s.palavras?.revisar ?? [])])];

const treinoDe = (s: PackageSession): TreinoChat[] =>
  (Array.isArray(s.chat?.treino) ? s.chat!.treino : []).map((t) => (typeof t === 'string' ? { en: t } : t)).filter((t) => isObj(t) && text(t.en));

/**
 * A semana conversa com o vocabulário do aluno? Confere, por sessão, a cobertura de palavras
 * conhecidas e as habilidades; e, numa semana inteira, se cada palavra nova aparece em várias
 * sessões e se as quase esquecidas foram revisadas. Só alerta: nada aqui bloqueia.
 */
function conferirIntegracao(data: UserData, p: WeekPackage, lists: Record<keyof ContentBundle, Record<string, unknown>[]>): Integracao[] {
  const out: Integracao[] = [];
  const aluno = contextoDoAluno(data);
  const conhecidas = new Set<string>();
  aluno.vocabulario.forEach(([en]) => adicionarTexto(conhecidas, en));
  const palavraDoRef = (r: string): string | undefined => {
    const { kind, id } = parseRef(r as ContentRef);
    if (kind !== 'word') return undefined;
    const doPacote = lists.words.find((w) => w.id === id);
    if (doPacote) return String(doPacote.word ?? '');
    return [...baseContent.words, ...(data.content?.words ?? [])].find((w) => w.id === id)?.word;
  };
  // exemplos: os do pacote (ainda não estão no repositório) ou os que já existem
  const exemploDoPacote = new Map(lists.examples.map((x) => [String(x.id), String(x.en ?? '')]));
  const exemplosDe = (r: ContentRef): string[] => {
    const { kind, id } = parseRef(r);
    const chave = ({ word: 'words', expression: 'expressions', pattern: 'patterns', grammar: 'grammar' } as Record<string, keyof ContentBundle>)[kind];
    const item = chave ? lists[chave].find((x) => x.id === id) : undefined;
    if (item) return (Array.isArray(item.examples) ? item.examples : []).map((e) => exemploDoPacote.get(String(e)) ?? '').filter(Boolean);
    return examplesFor(r).map((e) => e.en);
  };

  const sessoes = packageSessions(p);
  const novasDaSemana = new Map<string, number>(); // ref → em quantas sessões aparece
  lists.words.forEach((w) => novasDaSemana.set(`word:${w.id}`, 0));
  sessoes.forEach(({ s }) => {
    const todas = new Set([...refsDaSessao(s), ...(s.palavras?.apoio ?? [])]);
    todas.forEach((r) => novasDaSemana.has(r) && novasDaSemana.set(r, novasDaSemana.get(r)! + 1));
  });

  sessoes.forEach(({ date, s }) => {
    const nome = `${date.split('-').reverse().slice(0, 2).join('/')} · ${s.title ?? 'sem título'}`;
    // nesta aula, contam como conhecidas também as palavras que ela ensina
    const daAula = new Set(conhecidas);
    refsDaSessao(s).forEach((r) => { const en = palavraDoRef(r); if (en) adicionarTexto(daAula, en); });
    lists.words.forEach((w) => refsDaSessao(s).includes(`word:${w.id}` as ContentRef) && adicionarTexto(daAula, String(w.word ?? '')));
    const exercicios = (s.exercises ?? []).filter((x): x is Exclude<typeof x, string> => typeof x !== 'string');
    const textos = [
      ...refsDaSessao(s).flatMap(exemplosDe),
      ...exercicios.flatMap((x) => [x.prompt, ...(Array.isArray(x.answer) ? x.answer : [x.answer ?? '']), ...(x.options ?? []), ...(x.pairs ?? []).map((par) => par[0]), ...(x.tokens ?? [])]),
      ...(s.aula?.escuta ?? []).map((f) => f.en), ...(s.aula?.fala ?? []).map((f) => f.en),
      ...(s.aula?.missao?.tarefas ?? []).map((f) => f.en),
      ...treinoDe(s).map((t) => t.en),
    ].filter((t): t is string => typeof t === 'string' && /[a-z]/i.test(t))
      // os enunciados em português dos exercícios ficam de fora: só conta o inglês
      .filter((t) => !/[ãõçáéíóúâêô]/i.test(t));
    const c = cobertura(textos, daAula);
    if (c.total >= 10) {
      const ok = c.taxa >= COBERTURA_MINIMA;
      out.push({ ok, texto: `${nome}: ${Math.round(c.taxa * 100)}% de palavras conhecidas${ok ? '' : ` (mínimo ${COBERTURA_MINIMA * 100}%). Fora do vocabulário: ${c.desconhecidas.slice(0, 8).join(', ')}`}` });
    }
    // habilidades: exercícios marcados e cartões escritos
    const habs = new Set<Habilidade>(exercicios.map((x) => x.habilidade).filter((h): h is Habilidade => !!h));
    if (s.aula?.escuta?.length) habs.add('ouvir');
    if (s.aula?.fala?.length) habs.add('falar');
    if (s.aula?.missao || treinoDe(s).length) habs.add('usar');
    if (habs.size && habs.size < 3) out.push({ ok: false, texto: `${nome}: só ${[...habs].join(' e ')}; uma aula completa treina pelo menos 3 habilidades (reconhecer, lembrar, ouvir, falar, usar).` });
    // profundidade: exercícios suficientes e cartões que não repetem as mesmas frases
    const total = (s.exercises ?? []).length;
    if (total && total < 8) out.push({ ok: false, texto: `${nome}: ${total} exercícios; uma aula completa tem de 8 a 12, misturando os tipos.` });
    const cartoes = [...(s.aula?.escuta ?? []), ...(s.aula?.fala ?? []), ...(s.aula?.missao?.tarefas ?? [])].map((f) => f.en.trim().toLowerCase());
    const repetidas = [...new Set(cartoes.filter((f, i) => cartoes.indexOf(f) !== i))];
    if (repetidas.length) out.push({ ok: false, texto: `${nome}: a mesma frase em mais de um cartão (escuta, fala, missão): ${repetidas.slice(0, 3).join(' · ')}. Use frases diferentes em cada um.` });
  });

  // exercícios iguais (mesmo enunciado e resposta) em aulas diferentes
  const vistos = new Map<string, string>();
  const repetidos = new Set<string>();
  sessoes.forEach(({ s }) => (s.exercises ?? []).forEach((x) => {
    if (typeof x === 'string') return;
    const chave = `${x.prompt}|${JSON.stringify(x.answer ?? '')}`.toLowerCase();
    const dono = vistos.get(chave);
    if (dono && dono !== s.title) repetidos.add(x.prompt);
    else vistos.set(chave, s.title);
  }));
  if (repetidos.size) out.push({ ok: false, texto: `Exercícios repetidos em aulas diferentes: ${[...repetidos].slice(0, 3).join(' · ')}.` });
  // palavras de verdade novas: as do arquivo que o aluno ainda não tem
  const jaTem = new Set(aluno.vocabulario.map(([en]) => en.toLowerCase()));
  const novasPalavras = lists.words.filter((w) => !jaTem.has(String(w.word ?? '').toLowerCase()));
  const novasExpressoes = lists.expressions.filter((e) => !jaTem.has(String(e.text ?? '').replace(/[?!.]+$/, '').toLowerCase()));
  const pobres = novasPalavras.filter((w) => !Array.isArray(w.examples) || w.examples.length < 3).map((w) => String(w.word ?? w.id));
  if (pobres.length) out.push({ ok: false, texto: `Palavras novas com menos de 3 exemplos: ${pobres.slice(0, 6).join(', ')}.` });

  // ritmo: quantas novas cabem na semana, decidido pelo app (contextoAluno.ts), não pela IA
  const novas = novasPalavras.length + novasExpressoes.length;
  const teto = aluno.ritmo.novas_na_semana;
  if (novas > teto) {
    out.push({ ok: false, texto: `${novas} palavras ou expressões novas, mas o seu ritmo agora comporta ${teto} na semana (${aluno.ritmo.em_treino} ainda em treino). Novidade demais atrapalha fixar o que está em treino.` });
  } else if (novas) {
    out.push({ ok: true, texto: `${novas} ${novas === 1 ? 'novidade' : 'novidades'} na semana, dentro do seu ritmo (até ${teto}).` });
  }

  // semana inteira: repetição das novas e revisão das quase esquecidas
  const diasNoArquivo = (Array.isArray(p.days) ? p.days : []).length;
  if (diasNoArquivo >= 5) {
    novasDaSemana.forEach((n, ref) => {
      if (n > 0 && n < REPETICOES_NA_SEMANA) out.push({ ok: false, texto: `${ref.slice(5)} aparece em ${n} ${n === 1 ? 'sessão' : 'sessões'}; palavra nova fixa melhor vista em ${REPETICOES_NA_SEMANA} sessões diferentes.` });
    });
    const citadas = new Set(sessoes.flatMap(({ s }) => [...refsDaSessao(s), ...(s.palavras?.apoio ?? []), ...(s.aula?.aquecimento ? [s.aula.aquecimento] : [])])
      .map((r) => palavraDoRef(r)?.toLowerCase()).filter(Boolean));
    const esquecidas = aluno.vocabulario.filter((l) => l[2] === 'quase_esquecida').map((l) => l[0]);
    const faltam = esquecidas.filter((en) => !citadas.has(en.toLowerCase()));
    if (esquecidas.length) {
      out.push(faltam.length
        ? { ok: false, texto: `Quase esquecidas sem revisão nesta semana: ${faltam.slice(0, 10).join(', ')}.` }
        : { ok: true, texto: `As ${esquecidas.length} palavras quase esquecidas voltam nesta semana.` });
    }
  }
  return out;
}

function checkAula(w: string, a: unknown, err: (m: string) => void, refOk: (where: string, r: unknown) => void) {
  if (a === undefined) return;
  if (!isObj(a)) return err(`${w}: "aula" deve ser um objeto.`);
  if (a.aquecimento !== undefined) refOk(`${w}, aula.aquecimento`, a.aquecimento);
  const frases = (campo: string, l: unknown) => listOf<unknown>(l, `${w}: ${campo}`, err).forEach((f, i) => {
    if (!isObj(f) || !text(f.en) || !text(f.pt)) err(`${w}, ${campo} ${i + 1}: precisa de "en" e "pt".`);
  });
  frases('aula.escuta', a.escuta);
  frases('aula.fala', a.fala);
  if (a.missao !== undefined) {
    if (!isObj(a.missao) || !text(a.missao.situacao)) err(`${w}: aula.missao precisa de "situacao" e "tarefas".`);
    else frases('aula.missao.tarefas', a.missao.tarefas);
  }
}

function checkExercise(where: string, e: Partial<Exercise>, err: (m: string) => void) {
  if (!isObj(e) || !EX_TYPES.includes(e.type as ExerciseType)) return err(`${where}: "type" deve ser ${EX_TYPES.join(', ')}.`);
  if (e.habilidade !== undefined && !HABILIDADES.includes(e.habilidade)) err(`${where}: "habilidade" deve ser ${HABILIDADES.join(', ')}.`);
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
  const ws = semanaDoPacote(p);
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
  if (p.goals !== undefined && ws) saveWeekGoals(draft, ws, p.goals);

  const result: ApplyResult = { created: [], updated: [], kept: [...plan.keep], removed: [...plan.remove] };
  const usados = new Set<string>();
  p.days.forEach((d) => {
    saveDayPlan(draft, d.date, {
      ...(d.theme !== undefined && { theme: d.theme }),
      ...(d.objective !== undefined && { objective: d.objective }),
      ...(d.minutes !== undefined && { minutes: d.minutes }),
    });
    (d.sessions ?? []).forEach((ps) => {
      const cur = sessaoCorrespondente(draft, d.date, ps, usados);
      if (cur) usados.add(cur.id);
      if (cur && cur.status !== 'planned') return; // já iniciada/feita: não mexe

      const refs = refsDaSessao(ps);
      let s: Session;
      if (cur) {
        // mesma sessão, mesmo código: atualiza no lugar (a folha impressa continua valendo)
        Object.assign(cur, {
          date: d.date, weekStart: weekStartOf(d.date), kind: ps.kind, topicId: ps.topic,
          title: ps.title, objective: ps.objective ?? '', refs,
          copyRefs: ps.copyRefs ?? cur.copyRefs, whenToUse: ps.whenToUse || undefined,
        });
        s = cur;
        result.updated.push(s.id);
      } else {
        s = createSession(draft, {
          date: d.date, kind: ps.kind, topicId: ps.topic, title: ps.title, objective: ps.objective ?? '',
          refs, copyRefs: ps.copyRefs ?? (ps.sheet?.copy ? [] : undefined), whenToUse: ps.whenToUse,
        });
        result.created.push(s.id);
      }
      // exercícios escritos dentro da sessão viram conteúdo do usuário
      const exIds = (ps.exercises ?? []).map((x, i) => {
        if (typeof x === 'string') return x;
        const ex = normalizeContent({ exercises: [{ ...x, id: x.id ?? `${s.id}-x${i + 1}`, refs: x.refs ?? refs } as Exercise] }).exercises![0];
        uc.exercises = [...(uc.exercises ?? []).filter((e) => e.id !== ex.id), ex];
        return ex.id;
      });
      s.sheet = ps.sheet;
      s.app = ps.app;
      s.expected = ps.expected;
      s.exerciseIds = exIds.length ? exIds : undefined;
      s.palavras = ps.palavras;
      s.aula = ps.aula;
      const treino = treinoDe(ps);
      s.treino = treino.length ? treino : undefined;
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
    aluno: contextoDoAluno(data),
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
          ...(s.palavras && { palavras: s.palavras }),
          ...(s.aula && { aula: s.aula }),
          ...(s.treino && { chat: { treino: s.treino } }),
        })),
      };
    }),
  };
}

/** Modelo comentado para começar uma semana nova. */
export function templatePackage(weekStart: string, aluno?: ContextoAluno): WeekPackage & {
  $leia_me: string[];
  $plataforma: Record<string, string>;
  $como_pedir: { pedido: string; preencha: Record<string, string>; regras: string[] };
} {
  return {
    // o que a plataforma faz com cada coisa que vem no arquivo — para quem monta
    // a semana (ou pede a uma IA que monte) saber o que vale a pena preencher
    $plataforma: {
      'aula guiada': 'Entender → Observar → Relacionar → Praticar → Avaliar. Usa app.intro/context/tips, o conteúdo de refs (explicação, exemplos, usos, variações), os exercises e expected.',
      'ler aula': 'A mesma aula em texto corrido, para ler do começo ao fim. Quanto mais campos vierem preenchidos, mais completa ela fica.',
      'ouvir e traduzir': 'Toda palavra, expressão e exemplo em inglês é falada ao toque (áudio do campo audio, se houver; senão a voz do sistema) e mostra a tradução ali mesmo.',
      'folha impressa': 'sheet.copy (Conceito principal, até 3 linhas), sheet.quiz (Tente sem consultar, até 6), sheet.practice (Minha prática) e whenToUse. O verso é lido pela câmera em Escanear.',
      'revisão espaçada': 'Cada conteúdo de refs entra no histórico ao finalizar a sessão e volta em Revisão conforme o resultado (absorvido, revisar, reforçar).',
      'biblioteca': 'words, expressions, patterns e grammar viram fichas navegáveis; sheets vira folha de vocabulário do usuário.',
      'jogos': 'words (e as variations delas), expressions e sheets alimentam o Tetris, os Flashcards, o Ligar palavras e as Palavras cruzadas. Cruzadas só usam palavras de 3 a 9 letras, sem espaço ou hífen.',
      'exercícios': 'types: translate, fill, choice, match, build, qa, produce. Sem exercises, a aula gera exercícios a partir do conteúdo.',
      'pontuação': 'Cada rodada de jogo vale 100 pontos; no Tetris, 5 acertos fecham um nível de 100.',
      'ler a folha em voz alta': 'Na Biblioteca, cada folha lê tudo em sequência, alternando inglês e português, com velocidade, pausa e repetição. Vem de words/expressions/patterns/grammar e das traduções.',
      'meu progresso': 'Palavras que mais acerta e que mais escapam (placar dos jogos), frequência de estudo e tempo até um conteúdo firmar. Vem do histórico de refs e do resultado das sessões corrigidas, não do arquivo.',
      'vocabulário do aluno': 'O bloco aluno (gerado pelo app) traz cada palavra com o estado: firme, estudando, quase_esquecida, nao_praticada. As aulas devem ser montadas em cima dele.',
      'palavras (na sessão)': 'novas = o foco da aula (até 4, viram cartões); revisar = quase esquecidas do vocabulário (voltam no aquecimento); apoio = firmes usadas nos exemplos e exercícios.',
      'aula (na sessão)': 'Cartões escritos à mão: aquecimento (ref de uma palavra a lembrar), escuta e fala (frases en/pt), missao (situação + tarefas). O que faltar, o app monta a partir do conteúdo.',
      'habilidade (no exercício)': 'reconhecer, lembrar, ouvir, falar ou usar. Vai para o relatório de progresso (nível por habilidade).',
      'chat.treino (na sessão)': 'Perguntas em inglês que o amigo da Conversa faz no treino, ligadas a esta aula. Opcional: pt (tradução) e resposta (modelo, ex.: "I work at ____.").',
      'conferência na importação': 'A prévia mostra a cobertura de palavras conhecidas por aula (mínimo 95%), palavras novas vistas em menos de 3 sessões, quase esquecidas sem revisão e aulas com menos de 3 habilidades. São alertas: a importação não é bloqueada.',
      'só no aparelho': 'Tema claro/escuro, estrela das folhas, nome que você dá a cada folha e as vozes dos Ajustes ficam no aparelho: não entram nem saem neste arquivo.',
    },
    // pronto para colar num chat de IA: o pedido, o que o aluno preenche e as
    // regras que o arquivo precisa respeitar para o aplicativo aceitar
    $como_pedir: {
      pedido:
        'Você vai montar uma semana de estudo de inglês para mim no formato deste arquivo JSON. '
        + 'Responda só com o JSON, sem texto em volta, começando em "format" e mantendo exatamente os nomes de campo daqui. '
        + 'Use os campos $plataforma e $leia_me deste modelo para saber o que cada campo faz, siga as regras de $como_pedir.regras '
        + 'e apague os campos que começam com $ na sua resposta.',
      preencha: {
        'meu nível': 'ex.: iniciante, sei me apresentar e pouco mais',
        'quanto tempo por dia': 'ex.: 20 minutos, de segunda a sexta',
        'o que preciso nesta semana': 'ex.: pedir informação em viagem: aeroporto, hotel e restaurante',
        'o que já estudei': 'ex.: how, what, where, verbo be, perguntas com do',
        'como gosto de estudar': 'ex.: muitos exemplos curtos e uma produção escrita por dia',
      },
      regras: [
        'Escreva tudo em português, menos o inglês que está sendo estudado.',
        'week: a segunda-feira da semana, no formato AAAA-MM-DD. As datas dos dias ficam dentro dessa semana.',
        'ids: minúsculos, sem acento e sem espaço (ex.: "where-do-you-work"). Cada id aparece uma vez só.',
        'refs e exercises só podem citar ids que existem neste arquivo ou já no aplicativo.',
        'Todo exemplo citado em uses[].examples, words[].examples ou expressions[].examples precisa estar em content.examples.',
        'kind vai de new no começo da semana para practice, review, reinforce e consolidate no fim.',
        'sheet.copy: no máximo 3 linhas. sheet.quiz: no máximo 6 itens. São o que cabe na folha impressa.',
        'exercises.type: translate, fill, choice, match, build, qa ou produce. choice precisa de options; match precisa de pairs.',
        'Palavras para as cruzadas funcionam melhor com 3 a 9 letras, sem espaço nem hífen.',
        'Monte as aulas em cima do bloco aluno: nos exemplos, exercícios, escutas, falas, missões e treino, pelo menos 95% das palavras devem ser do vocabulário do aluno; o resto, só as palavras.novas daquela sessão.',
        'Cada sessão: até 4 palavras.novas; coloque em palavras.revisar as palavras "quase_esquecida" do aluno, espalhadas pela semana; use as "firme" em palavras.apoio.',
        'Cada palavra nova deve aparecer em pelo menos 3 sessões diferentes da semana (como nova, revisar ou apoio).',
        'Cada sessão treina pelo menos 3 habilidades: marque habilidade nos exercícios e use aula.escuta (ouvir), aula.fala (falar) e aula.missao ou chat.treino (usar).',
        'Para mudar só um dia ou uma aula, mande só esses dias: os outros ficam como estão. Sem id, a aula de mesmo dia e mesmo título é atualizada.',
        'QUANTAS PALAVRAS NOVAS: quem decide é o app, em aluno.ritmo.novas_na_semana (calculado pelo que ainda está em treino). Nunca passe desse total na semana; distribua como fizer sentido, sem obrigação de novidade todo dia. Aulas sem palavra nova aprofundam as que estão em treino (estudando, quase_esquecida): mais exemplos, mais uso, situações novas. Sem bloco aluno, use no máximo 8 novas na semana.',
        'PROFUNDIDADE (o app confere e avisa na prévia): siga a aula "Where do you work?" deste modelo como referência de tamanho e variedade.',
        'Cada palavra nova vem completa: pronunciation.ipa, pelo menos 1 uso (uses) e pelo menos 3 exemplos próprios em content.examples, em situações diferentes.',
        'Cada aula tem de 8 a 12 exercícios misturando os tipos: choice, fill, build, match, translate (pt→en e en→pt), qa e pelo menos 1 produce. Não repita o mesmo exercício (mesmo enunciado e resposta) em aulas diferentes.',
        'build: sempre com "tokens" (as palavras da resposta, embaralhadas) e "answer". match: "pairs" como lista de pares ["inglês", "português"], nunca objetos. choice: 3 ou 4 options plausíveis.',
        'aula.escuta, aula.fala e aula.missao.tarefas usam frases DIFERENTES entre si (2 a 4 em cada): escuta para reconhecer, fala para repetir, missão para produzir numa situação nova.',
        'Varie as frases: respostas com detalhes reais (at a school / in an office / from home), negativas, perguntas de volta (And you?), terceira pessoa, lugares e horários.',
        'app.intro explica a regra com um exemplo; app.tips traz 2 a 4 dicas práticas (erros comuns de quem fala português, pronúncia, quando usar); expected.criteria diz o que a pessoa consegue fazer, de forma verificável.',
        'chat.treino: 3 a 5 perguntas por aula, com resposta modelo usando ____ no lugar do que é pessoal.',
        'Não devolva o bloco aluno nem os campos que começam com $.',
        'Não invente campos novos: use só os que aparecem neste modelo.',
      ],
    },
    $leia_me: [
      'Pacote semanal do Inglês Híbrido (semana@2). Campos que começam com $ são ignorados.',
      'Estrutura formal (JSON Schema): https://eita.exksvol.com/formatos/semana@2.schema.json',
      'content: conteúdo NOVO da semana (mesmo formato dos arquivos em /content). Pode referenciar o conteúdo que já existe.',
      'refs: conteúdos estudados na sessão: "word:id", "expression:id", "pattern:id", "grammar:id".',
      'sheet: o que vai para a FOLHA (copy = Conceito principal, até 3 linhas; quiz = Tente sem consultar, até 6; practice = instrução da Minha prática).',
      'app: o que fica SÓ NO APLICATIVO (intro, context, tips). A explicação completa, os exemplos e as variações vêm do conteúdo em refs.',
      'exercises: ids de exercícios existentes ou exercícios completos (type: translate, fill, choice, match, build, qa, produce).',
      'expected: o resultado que o aluno deve conseguir ao final (result + criteria). Aparece na aula e na avaliação.',
      'kind: new (novo conteúdo), practice, review, reinforce, consolidate, nessa ordem ao longo da semana.',
      'id (na sessão): código da sessão, vem na semana exportada. Reimportando, a sessão de mesmo código é atualizada no lugar (a folha impressa continua valendo); sem id = sessão nova.',
      'sheets: folhas da Biblioteca (title + items com en/pt). Mesmo título soma na folha que já existe.',
      'goals: objetivos da semana; saem no campo de anotações da folha semanal impressa.',
      'copyRefs: quais dos refs entram na folha com o bloco ✎ COPIE (o conteúdo precisa ter copy).',
      'copy (no conteúdo): { lines: [...] } é o bloco ✎ COPIE daquele item, copiado à mão na folha.',
      'topic (na sessão): id de um tema de content.topics; ao escolher, título, objetivo e refs vêm dele.',
      'topics: temas reutilizáveis (id, title, description, objective, refs) que aparecem no formulário da sessão.',
      'audio (na palavra): URL de um áudio; sem ele, a pronúncia usa a voz do aparelho.',
      'minutes (no dia): tempo previsto, impresso na folha semanal.',
      'week: opcional. Sem ele, só os dias do arquivo mudam (dá para mandar uma aula só).',
      'palavras (na sessão): { novas, revisar, apoio } com refs "word:id". Sem refs, a sessão estuda novas + revisar.',
      'aula (na sessão): { aquecimento: "word:id", escuta: [{en, pt}], fala: [{en, pt}], missao: { situacao, tarefas: [{en, pt}] } }.',
      'habilidade (no exercício): reconhecer, lembrar, ouvir, falar ou usar.',
      'chat.treino (na sessão): perguntas do treino de conversa, "texto" ou { en, pt, resposta }.',
      'aluno: gerado pelo app com o vocabulário e o estado de cada palavra. Leia, não devolva.',
    ],
    format: PACKAGE_FORMAT,
    ...(aluno && { aluno }),
    week: weekStart,
    goals: 'Fazer e responder perguntas de apresentação.',
    content: {
      examples: [
        { id: 'ex-where-do-you-work', en: 'Where do you work?', pt: 'Onde você trabalha?', context: 'trabalho' },
        { id: 'ex-i-work-at-home', en: 'I work at home.', pt: 'Eu trabalho em casa.', context: 'resposta' },
        { id: 'ex-how-are-you', en: 'How are you?', pt: 'Como você está?', context: 'cumprimento' },
        { id: 'ex-i-am-fine', en: 'I am fine, thanks.', pt: 'Estou bem, obrigado.', context: 'resposta' },
        { id: 'ex-i-work-in-an-office', en: 'I work in an office downtown.', pt: 'Eu trabalho num escritório no centro.', context: 'trabalho' },
        { id: 'ex-office-small', en: 'My office is small but quiet.', pt: 'Meu escritório é pequeno, mas silencioso.', context: 'descrição' },
        { id: 'ex-office-meeting', en: 'We have a meeting at the office at nine.', pt: 'Temos uma reunião no escritório às nove.', context: 'rotina' },
        { id: 'ex-i-work-at-a-school', en: 'I work at a school.', pt: 'Eu trabalho numa escola.', context: 'trabalho' },
        { id: 'ex-school-near', en: 'The school is near my house.', pt: 'A escola fica perto da minha casa.', context: 'lugar' },
        { id: 'ex-school-teacher', en: 'She is a teacher at a big school.', pt: 'Ela é professora numa escola grande.', context: 'profissão' },
      ],
      expressions: [
        {
          id: 'how-are-you', text: 'How are you?', words: ['how'],
          translation: 'Como você está?', context: 'cumprimento', meaning: 'Pergunta como a pessoa está.',
          examples: ['ex-how-are-you', 'ex-i-am-fine'],
          copy: { lines: ['How are you? = Como você está?'] },
        },
        {
          id: 'where-do-you-work', text: 'Where do you work?', words: ['where', 'do', 'work'],
          translation: 'Onde você trabalha?', context: 'conversa de apresentação',
          meaning: 'Pergunta o lugar de trabalho.', pattern: 'pergunta-com-do',
          examples: ['ex-where-do-you-work'],
          copy: { lines: ['Where do you work? = Onde você trabalha?'] },
        },
      ],
      patterns: [
        {
          id: 'pergunta-com-do', name: 'Pergunta com do', formula: 'Wh + do + subject + verb?',
          slots: [{ name: 'Wh', options: ['where', 'what', 'how'] }, { name: 'subject', options: ['you', 'they'] }],
          explanation: 'Com a maioria dos verbos, a pergunta usa do/does antes do sujeito.',
          examples: ['ex-where-do-you-work'],
        },
      ],
      grammar: [
        {
          id: 'ordem-da-pergunta', title: 'Ordem das palavras na pergunta',
          explanation: 'Em inglês a pergunta troca a ordem: o auxiliar vem antes do sujeito.',
          points: ['Wh + auxiliar + sujeito + verbo', 'O verbo principal fica no infinitivo'],
          examples: ['ex-where-do-you-work'],
        },
      ],
      topics: [
        {
          id: 'trabalho', title: 'Trabalho', description: 'Falar do que se faz.',
          objective: 'Perguntar e dizer onde trabalha.',
          refs: ['word:work', 'expression:where-do-you-work'],
        },
      ],
      words: [
        {
          id: 'how', word: 'how', type: 'question word', translations: [{ text: 'como' }],
          core_meaning: 'Pergunta o estado ou a maneira.', uses: [], variations: [{ form: 'how much', meaning: 'quanto (custa)' }],
          related_words: [], examples: ['ex-how-are-you'], pronunciation: { ipa: '/haʊ/', respelling: 'ráu' },
        },
        {
          id: 'where', word: 'where', type: 'question word', translations: [{ text: 'onde' }],
          core_meaning: 'Pergunta o lugar.', uses: [], variations: [], related_words: [], examples: ['ex-where-do-you-work'],
          pronunciation: { ipa: '/wer/', respelling: 'uér' },
        },
        {
          id: 'do', word: 'do', type: 'auxiliary / verb', translations: [{ text: 'fazer', context: 'verbo' }, { text: '(auxiliar de pergunta)', context: 'auxiliar' }],
          core_meaning: 'Auxiliar das perguntas com a maioria dos verbos; também "fazer".', uses: [], variations: [{ form: 'does', meaning: 'he/she/it' }],
          related_words: [], examples: ['ex-where-do-you-work'], pronunciation: { ipa: '/duː/', respelling: 'dú' },
        },
        {
          id: 'office', word: 'office', type: 'noun', translations: [{ text: 'escritório' }],
          core_meaning: 'Lugar onde se trabalha em mesas, computadores e reuniões.',
          uses: [{ id: 'lugar', label: 'lugar de trabalho', meaning: 'escritório', explanation: 'Com in: I work in an office.', examples: ['ex-i-work-in-an-office', 'ex-office-small'] }],
          variations: [{ form: 'at the office', meaning: 'no escritório' }], related_words: ['work'],
          examples: ['ex-i-work-in-an-office', 'ex-office-small', 'ex-office-meeting'], pronunciation: { ipa: '/ˈɒfɪs/', respelling: 'ófis' },
        },
        {
          id: 'school', word: 'school', type: 'noun', translations: [{ text: 'escola' }],
          core_meaning: 'Lugar onde se estuda ou se ensina.',
          uses: [{ id: 'lugar', label: 'lugar', meaning: 'escola', explanation: 'Com at: I work at a school.', examples: ['ex-i-work-at-a-school', 'ex-school-near'] }],
          variations: [], related_words: ['teacher'],
          examples: ['ex-i-work-at-a-school', 'ex-school-near', 'ex-school-teacher'], pronunciation: { ipa: '/skuːl/', respelling: 'scúl' },
        },
        {
          id: 'work', word: 'work', type: 'verb / noun',
          translations: [{ text: 'trabalhar', context: 'verbo' }, { text: 'trabalho', context: 'substantivo' }],
          core_meaning: 'Realizar uma atividade profissional; também o próprio trabalho.',
          uses: [{ id: 'verb', label: 'verbo', meaning: 'trabalhar', explanation: 'Com do nas perguntas: Where do you work?', examples: ['ex-where-do-you-work', 'ex-i-work-at-home'] }],
          variations: [{ form: 'at work', meaning: 'no trabalho' }],
          related_words: ['where', 'do'],
          examples: ['ex-where-do-you-work', 'ex-i-work-at-home', 'ex-i-work-at-a-school'],
          pronunciation: { ipa: '/wɜːrk/', respelling: 'uârk' },
          copy: { lines: ['work = trabalhar / trabalho', 'Where do you work? = Onde você trabalha?'] },
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
            refs: ['word:how', 'expression:how-are-you'],
            whenToUse: 'Use how para perguntar como alguém está ou como algo é feito.',
            sheet: {
              copy: ['How = como', 'How + are/is + sujeito?', 'How are you? = Como você está?'],
              quiz: ['Como você está? →', 'Como eles estão? →', 'Como ela está? →', 'Estou bem, obrigado. →', 'Quanto custa? →', 'Como se diz isso em inglês? →'],
              practice: 'Escreva 5 perguntas com How para pessoas da sua família.',
            },
            app: {
              intro: 'How é a palavra de pergunta para estado e maneira.',
              context: 'Você encontra um colega no trabalho e quer saber como ele está.',
              tips: ['Em inglês, o verbo be vem antes do sujeito na pergunta.'],
            },
            exercises: [
              { type: 'choice', habilidade: 'reconhecer', prompt: 'How ___ they?', options: ['is', 'are', 'am'], answer: 'are' },
              { type: 'translate', habilidade: 'lembrar', prompt: 'Como você está?', answer: ['How are you?', 'How are you'] },
              { type: 'produce', habilidade: 'usar', prompt: 'Escreva como você responderia a "How are you?" em 3 situações.' },
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
            // AULA MODELO: é este o nível de profundidade esperado em cada aula
            kind: 'new', title: 'Where do you work?',
            objective: 'Perguntar onde alguém trabalha e responder com detalhes sobre o próprio trabalho.',
            refs: ['pattern:pergunta-com-do', 'expression:where-do-you-work'],
            palavras: { novas: ['word:work', 'word:office', 'word:school'], revisar: ['word:where'], apoio: ['word:do', 'word:how'] },
            copyRefs: ['word:work'],
            whenToUse: 'Where do you work? abre conversa sobre trabalho; responda com I work at/in + lugar.',
            sheet: {
              copy: ['Where do you work? = Onde você trabalha?', 'I work at a school. / I work in an office.', 'at + lugar específico · in + dentro de um lugar'],
              quiz: ['Onde você trabalha? →', 'Eu trabalho em casa. →', 'Onde ela trabalha? →', 'escritório →', 'Eu não trabalho aos domingos. →', 'Monte: work / you / where / do →'],
              practice: 'Escreva 4 frases sobre onde você e pessoas da sua família trabalham.',
            },
            app: {
              intro: 'Para perguntar com quase todos os verbos, o inglês usa do antes de quem: Where do you work? Na resposta, o do some: I work at home.',
              context: 'Primeiro dia num curso: um colega puxa conversa no intervalo.',
              tips: [
                'Erro comum de quem fala português: "Where you work?" sem o do.',
                'Com he/she, o do vira does: Where does she work?',
                'work tem o som de "uârk": o r é leve, sem vibrar.',
                'at a school (o lugar); in an office (dentro do escritório); from home (de casa).',
              ],
            },
            aula: {
              aquecimento: 'word:where',
              escuta: [
                { en: 'I work at a school near my house.', pt: 'Eu trabalho numa escola perto da minha casa.' },
                { en: 'She works in a big office downtown.', pt: 'Ela trabalha num escritório grande no centro.' },
                { en: "I don't work on Sundays.", pt: 'Eu não trabalho aos domingos.' },
              ],
              fala: [
                { en: 'Where do you work?', pt: 'Onde você trabalha?' },
                { en: 'I work from home. And you?', pt: 'Eu trabalho de casa. E você?' },
              ],
              missao: {
                situacao: 'Um colega novo pergunta do seu trabalho no intervalo. Responda com um detalhe e pergunte de volta.',
                tarefas: [
                  { en: 'I work in an office.', pt: 'Eu trabalho num escritório.' },
                  { en: 'Where does your sister work?', pt: 'Onde a sua irmã trabalha?' },
                  { en: 'My office is small but quiet.', pt: 'Meu escritório é pequeno, mas silencioso.' },
                ],
              },
            },
            exercises: [
              { type: 'choice', habilidade: 'reconhecer', prompt: 'Where ___ you work?', options: ['do', 'are', 'does', 'is'], answer: 'do' },
              { type: 'choice', habilidade: 'reconhecer', prompt: 'Where ___ she work?', options: ['does', 'do', 'is', 'are'], answer: 'does' },
              { type: 'fill', habilidade: 'lembrar', prompt: 'I work ___ a school. (numa escola)', options: ['at', 'on', 'of'], answer: 'at' },
              { type: 'match', habilidade: 'reconhecer', prompt: 'Ligue cada palavra à tradução.', pairs: [['office', 'escritório'], ['school', 'escola'], ['work', 'trabalhar'], ['where', 'onde']] },
              { type: 'build', habilidade: 'lembrar', prompt: 'Monte a pergunta: "Onde você trabalha?"', tokens: ['work', 'you', 'Where', 'do'], answer: 'Where do you work?' },
              { type: 'build', habilidade: 'lembrar', prompt: 'Monte: "Eu não trabalho aos domingos."', tokens: ['on', "don't", 'Sundays', 'I', 'work'], answer: "I don't work on Sundays." },
              { type: 'translate', habilidade: 'lembrar', prompt: 'Traduza: Ela trabalha num escritório.', answer: ['She works in an office.', 'She works in an office'] },
              { type: 'translate', habilidade: 'reconhecer', prompt: 'Traduza para o português: My office is small but quiet.', answer: ['Meu escritório é pequeno, mas silencioso.', 'Meu escritório é pequeno mas silencioso'] },
              { type: 'qa', habilidade: 'usar', prompt: 'Where do you work? (responda com a sua vida)', answer: 'I work' },
              { type: 'produce', habilidade: 'usar', prompt: 'Escreva 3 frases: onde você trabalha, um detalhe do lugar e uma pergunta de volta.' },
            ],
            chat: {
              treino: [
                { en: 'Where do you work?', pt: 'Onde você trabalha?', resposta: 'I work at ____.' },
                { en: 'Do you like your office?', pt: 'Você gosta do seu escritório?', resposta: 'Yes, I do. / No, I don\'t.' },
                { en: 'Where does your best friend work?', pt: 'Onde o seu melhor amigo trabalha?', resposta: 'He/She works at ____.' },
              ],
            },
            expected: {
              result: 'Perguntar onde alguém trabalha e responder com pelo menos um detalhe.',
              criteria: ['Faz a pergunta com do (e does para he/she)', 'Responde com at/in + lugar', 'Usa a negativa I don\'t work…', 'Pergunta de volta (And you?)'],
            },
          },
        ],
      },
      {
        date: addDays(weekStart, 4), theme: 'Revisão da semana', minutes: 30,
        sessions: [
          {
            kind: 'review', title: 'Revisão: perguntas', refs: ['expression:how-are-you', 'expression:where-do-you-work'],
            palavras: { revisar: ['word:work', 'word:where'], apoio: ['word:how', 'word:do'] },
            aula: { escuta: [{ en: 'How are you?', pt: 'Como você está?' }], fala: [{ en: 'Where do you work?', pt: 'Onde você trabalha?' }] },
            exercises: [{ type: 'translate', habilidade: 'lembrar', prompt: 'Onde você trabalha?', answer: 'Where do you work?' }],
            expected: { result: 'Usar as perguntas da semana sem consultar.' },
          },
        ],
      },
    ],
  };
}
