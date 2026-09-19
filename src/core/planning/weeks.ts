import type { DayPlan, Session, SessionKind, UserData, Week } from '../types';
import { addDays, weekStartOf } from '../dates';

/** Ordem pedagógica da semana: novo → prática → revisão → reforço → consolidação. */
export const KIND_ORDER: SessionKind[] = ['new', 'practice', 'review', 'reinforce', 'consolidate'];

export const KIND_LABEL: Record<SessionKind, string> = {
  new: 'Novo conteúdo',
  practice: 'Prática',
  review: 'Revisão',
  reinforce: 'Reforço',
  consolidate: 'Consolidação',
};

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function getWeek(data: UserData, weekStart: string): Week {
  const found = data.weeks.find((w) => w.id === weekStart);
  if (found) return found;
  return {
    id: weekStart,
    goals: '',
    days: weekDates(weekStart).map((date) => ({ date, theme: '', objective: '' })),
  };
}

export function saveDayPlan(draft: UserData, date: string, patch: Partial<DayPlan>): void {
  const ws = weekStartOf(date);
  let w = draft.weeks.find((x) => x.id === ws);
  if (!w) {
    w = getWeek(draft, ws);
    draft.weeks.push(w);
  }
  const d = w.days.find((x) => x.date === date)!;
  Object.assign(d, patch);
}

export function saveWeekGoals(draft: UserData, weekStart: string, goals: string): void {
  let w = draft.weeks.find((x) => x.id === weekStart);
  if (!w) {
    w = getWeek(draft, weekStart);
    draft.weeks.push(w);
  }
  w.goals = goals;
}

export function sessionsOn(data: UserData, date: string): Session[] {
  return data.sessions
    .filter((s) => s.date === date)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
