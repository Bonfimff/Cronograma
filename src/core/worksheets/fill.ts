import type { Expression, Grammar, Pattern, Session, UserData, Word } from '../types';
import { copyBlock, examplesFor, parseRef, resolve } from '../content/repository';
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
    concept: copyLines(s),
    whenToUse: s.whenToUse?.trim() || autoWhenToUse(s),
    practice: s.sheet?.practice ? `→ ${s.sheet.practice}` : '',
  };
  quizItems(s).forEach((q, i) => (v[`quiz${i + 1}`] = q));
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
    const text = [...new Set(parts)].join(' · ') + (day?.objective ? ` — ${day.objective}` : '');
    v[`day${i}Text`] = text;
    if (day?.minutes) v[`day${i}Min`] = String(day.minutes);
  }
  return v;
}
