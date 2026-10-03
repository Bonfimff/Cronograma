import type { Expression, Grammar, Pattern, Session, UserData, Word } from '../types';
import { copyBlock, examplesFor, getWord, parseRef, resolve } from '../content/repository';
import { seeded, shuffle } from '../exercises/exercises';
import { addDays, fromISO } from '../dates';
import { getWeek, sessionsOn } from '../planning/weeks';

/** Valor de um campo da folha: texto de uma linha ou várias linhas. */
export type FieldValues = Record<string, string | string[]>;

const pad = (n: number) => String(n).padStart(2, '0');
function dmy(iso: string) {
  const d = fromISO(iso);
  return { d: pad(d.getDate()), m: pad(d.getMonth() + 1), y: String(d.getFullYear()) };
}

/** Quebra um texto em linhas de até `max` caracteres. */
export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/** Resumo automático para "Quando usar?". */
export function autoWhenToUse(s: Session): string {
  const ref = s.copyRefs[0] ?? s.refs[0];
  if (!ref) return s.objective;
  const it = resolve(ref);
  switch (parseRef(ref).kind) {
    case 'word': {
      const w = it as Word;
      return `${w.word}: ${w.core_meaning} Usos: ${w.uses.map((u) => u.label).join(', ')}.`;
    }
    case 'expression': return (it as Expression).context;
    case 'pattern': return (it as Pattern).explanation;
    case 'grammar': return (it as Grammar).explanation;
    default: return s.objective;
  }
}

/** Linhas ✎ COPIE da sessão, na ordem escolhida. */
export function copyLines(s: Session): string[] {
  if (s.sheet?.copy?.length) return s.sheet.copy;
  return s.copyRefs.flatMap((r) => copyBlock(r)?.lines ?? []);
}

/** "Tente sem consultar": frases em português para responder em inglês. */
export function quizItems(s: Session, n = 6): string[] {
  if (s.sheet?.quiz?.length) return s.sheet.quiz.slice(0, n);
  const seen = new Set<string>();
  const items: string[] = [];
  for (const r of s.refs) {
    for (const e of examplesFor(r)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      items.push(`${e.pt} →`);
      if (items.length >= n) return items;
    }
  }
  return items;
}

export function studySheetValues(s: Session | undefined, code: string): FieldValues {
  if (!s) return { session: code };
  const d = dmy(s.date), w = dmy(s.weekStart);
  const v: FieldValues = {
    dateD: d.d, dateM: d.m, dateY: d.y,
    weekD: w.d, weekM: w.m,
    theme: s.title,
    session: code,
    concept: regraDaFolha(s),
    whenToUse: s.whenToUse?.trim() || autoWhenToUse(s),
    practice: s.sheet?.practice ? `→ ${s.sheet.practice}` : '',
  };
  quizItems(s).forEach((q, i) => (v[`quiz${i + 1}`] = q));
  Object.assign(v, camposDaAtividade(atividadeDaFolha(s)));
  return v;
}

const COLUMN: Record<string, 'colNew' | 'colReview' | 'colPractice'> = {
  new: 'colNew', review: 'colReview', reinforce: 'colReview', practice: 'colPractice', consolidate: 'colPractice',
};

export function weekSheetValues(data: UserData, weekStart: string): FieldValues {
  const week = getWeek(data, weekStart);
  const w = dmy(weekStart);
  const v: FieldValues = { weekD: w.d, weekM: w.m, weekY: w.y, colNew: [], colReview: [], colPractice: [], notes: week.goals };
  const sessions = data.sessions.filter((s) => s.weekStart === weekStart);
  sessions.forEach((s) => {
    const col = v[COLUMN[s.kind]] as string[];
    if (!col.includes(s.title)) col.push(s.title);
  });
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const day = week.days.find((d) => d.date === date);
    const d = dmy(date);
    v[`day${i}Date`] = `${d.d}/${d.m}/${d.y}`;
    const parts = [day?.theme, ...sessionsOn(data, date).map((s) => s.title)].filter(Boolean);
    const text = [...new Set(parts)].join(' · ') + (day?.objective ? `: ${day.objective}` : '');
    v[`day${i}Text`] = text;
    if (day?.minutes) v[`day${i}Min`] = String(day.minutes);
  }
  return v;
}

// ---------- a regra e a atividade de fixação da folha ----------

/** Linha do tipo "How are you? = Como você está?": tradução para copiar, que a folha não quer mais. */
const ehTraducao = (l: string) => /\s=\s/.test(l);

/**
 * "A regra": uma explicação simples para copiar, nunca uma lista de traduções. Vem de
 * quem a pessoa escreveu (se não for tradução) ou do conteúdo: o padrão com a fórmula e a
 * explicação, a gramática, a expressão com o contexto de uso, a palavra com o significado.
 */
export function regraDaFolha(s: Session): string[] {
  if (s.sheet?.copy?.length && !s.sheet.copy.some(ehTraducao)) return s.sheet.copy;
  const linhas: string[] = [];
  const porTipo = (k: string) => s.refs.filter((r) => parseRef(r).kind === k).map((r) => resolve(r)).filter(Boolean);
  (porTipo('pattern') as Pattern[]).slice(0, 2).forEach((p) => linhas.push(`${p.formula}  ${p.explanation}`));
  if (!linhas.length) (porTipo('grammar') as Grammar[]).slice(0, 1).forEach((g) => linhas.push(`${g.title}: ${g.explanation}`));
  if (!linhas.length) (porTipo('expression') as Expression[]).slice(0, 2).forEach((e) => linhas.push(`${e.text} → ${e.context || e.meaning}`));
  if (!linhas.length) (porTipo('word') as Word[]).slice(0, 2).forEach((w) => linhas.push(`${w.word}: ${w.core_meaning}`));
  return linhas.length ? linhas : [s.objective];
}

export interface AtividadeFolha {
  banco: string[];
  complete: string[];
  ordene: string[];
  voce: string[];
  respostas: string;
}

const LACUNA = '________';
const VAZIAS = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'i']);
const palavrasDe = (frase: string) => frase.replace(/[?.!,;:]/g, '').split(/\s+/).filter(Boolean);
const fimDe = (frase: string) => (frase.trim().match(/[?.!]$/)?.[0] ?? '.');

/** Palavras que a aula ensina: são elas que viram lacuna. */
function palavrasDaAula(s: Session): Set<string> {
  const out = new Set<string>();
  s.refs.forEach((r) => {
    const { kind } = parseRef(r);
    const it = resolve(r);
    if (!it) return;
    if (kind === 'word') out.add((it as Word).word.toLowerCase());
    if (kind === 'expression') (it as Expression).words.forEach((w) => { const x = getWord(w); if (x) out.add(x.word.toLowerCase()); });
    if (kind === 'pattern') (it as Pattern).slots.forEach((sl) => sl.options.forEach((o) => out.add(o.toLowerCase())));
  });
  return out;
}

/**
 * Atividade de fixação, curta (uns 10 minutos) e sem cópia de tradução:
 * 1. complete com o banco de palavras (lembrar a palavra certa no lugar certo);
 * 2. ordene a frase (aplicar a ordem das palavras, o mais difícil para quem fala português);
 * 3. fale de você (frases sobre a própria vida: o que mais fixa, segundo a pesquisa).
 * Respostas de 1 e 2 vão de cabeça para baixo no pé, para conferir na hora.
 */
export function atividadeDaFolha(s: Session): AtividadeFolha {
  const rnd = seeded(`${s.id}:folha`);
  const vistos = new Set<string>();
  const exemplos = s.refs.flatMap((r) => examplesFor(r)).filter((e) => (vistos.has(e.id) ? false : (vistos.add(e.id), true)));
  const curtos = exemplos.filter((e) => palavrasDe(e.en).length >= 3 && palavrasDe(e.en).length <= 8);
  const alvoDaAula = palavrasDaAula(s);
  const usados = new Set<string>();

  // 1. complete
  const complete: string[] = [];
  const banco: string[] = [];
  const respostas: string[] = [];
  for (const e of shuffle(curtos, rnd)) {
    if (complete.length === 3) break;
    const ps = palavrasDe(e.en);
    const alvo = ps.find((p) => alvoDaAula.has(p.toLowerCase()))
      ?? [...ps].filter((p) => p.length >= 3 && !VAZIAS.has(p.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    if (!alvo) continue;
    const frase = e.en.replace(new RegExp(`\\b${alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), LACUNA);
    complete.push(`${frase}   (${e.pt})`);
    banco.push(alvo.toLowerCase());
    respostas.push(`${complete.length}) ${alvo.toLowerCase()}`);
    usados.add(e.id);
  }
  // uma palavra a mais no quadro: obriga a escolher, não só encaixar
  // a que sobra: da aula ou de uma frase (sem nomes próprios, que vêm com maiúscula no meio da frase)
  const extra = [...alvoDaAula, ...exemplos.flatMap((e) => palavrasDe(e.en).filter((p, i) => i > 0 && p === p.toLowerCase()))]
    .find((p) => p.length >= 3 && !banco.includes(p) && !VAZIAS.has(p));
  if (extra && banco.length) banco.push(extra);
  const bancoMisturado = shuffle(banco, rnd);

  // 2. ordene
  const ordene: string[] = [];
  // primeiro as frases que não caíram no "complete"
  const paraOrdenar = [...shuffle(curtos.filter((e) => !usados.has(e.id)), rnd), ...shuffle(curtos.filter((e) => usados.has(e.id)), rnd)];
  for (const e of paraOrdenar) {
    if (ordene.length === 2) break;
    // tudo minúsculo (menos "I" e nomes): a maiúscula entregaria qual palavra abre a frase
    const ps = palavrasDe(e.en).map((p, i) => (i === 0 && p !== 'I' ? p.toLowerCase() : p));
    if (ps.length < 3 || ps.length > 7) continue;
    let mistura = shuffle(ps, rnd);
    for (let k = 0; k < 4 && mistura.join(' ') === ps.join(' '); k++) mistura = shuffle(ps, rnd);
    ordene.push(`${mistura.join(' / ')}   ( ${fimDe(e.en)} )`);
    respostas.push(`${ordene.length === 1 ? 'Ordene: ' : ''}${e.en}`);
  }

  // 3. fale de você: molduras a partir das frases da aula sobre "eu"; senão, responder às perguntas da aula
  const voce: string[] = [];
  const sobreMim = exemplos.filter((e) => /^(I|My|I'm)\b/.test(e.en.trim()));
  for (const e of sobreMim) {
    if (voce.length === 2) break;
    const ps = e.en.replace(/[?.!]$/, '').split(/\s+/);
    const corte = ps.findIndex((p, i) => i > 0 && /^(is|am|are|work|live|like|have|do|study|want|need|'m)$/i.test(p));
    if (corte < 0) continue;
    let fim = corte + 1;
    if (/^(at|in|from|a|an|to|for|with)$/i.test(ps[fim] ?? '')) fim++;
    const moldura = `${ps.slice(0, fim).join(' ')} ${LACUNA}${fimDe(e.en)}`;
    if (!voce.includes(moldura)) voce.push(moldura);
  }
  for (const e of exemplos.filter((x) => x.en.trim().endsWith('?'))) {
    if (voce.length === 2) break;
    voce.push(`Responda sobre você: ${e.en}  →  ${LACUNA}${LACUNA}`);
  }
  if (!voce.length) voce.push(`Escreva uma frase sua usando o que aprendeu hoje: ${LACUNA}${LACUNA}${LACUNA}`);

  return { banco: bancoMisturado, complete, ordene, voce, respostas: respostas.join('   ') };
}

export function camposDaAtividade(a: AtividadeFolha): FieldValues {
  const v: FieldValues = { bank: a.banco.length ? a.banco.join('   ·   ') : '', answers: a.respostas };
  a.complete.forEach((x, i) => (v[`fill${i + 1}`] = x));
  a.ordene.forEach((x, i) => (v[`order${i + 1}`] = x));
  a.voce.forEach((x, i) => (v[`self${i + 1}`] = x));
  return v;
}
