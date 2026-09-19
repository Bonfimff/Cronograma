import type { ContentRef, SessionKind, UserData } from '../types';
import { addDays, daysBetween, today } from '../dates';
import { entriesFor } from '../history/history';

export type ReviewState = 'not_reviewed' | 'review' | 'reinforce' | 'scheduled' | 'consolidated';

export const STATE_LABEL: Record<ReviewState, string> = {
  not_reviewed: 'Ainda não revisado',
  review: 'Precisa revisar',
  reinforce: 'Precisa reforçar',
  scheduled: 'Em dia',
  consolidated: 'Consolidado',
};

/** Intervalos de revisão espaçada (dias) após cada estudo bem-sucedido. */
const INTERVALS = [1, 3, 7, 14, 30];

export interface ReviewItem {
  ref: ContentRef;
  state: ReviewState;
  lastDate: string;
  nextDate: string;
  studies: number;
}

export function reviewStatus(data: UserData, ref: ContentRef, now = today()): ReviewItem | null {
  const h = entriesFor(data, ref);
  if (!h.length) return null;
  const last = h[h.length - 1];
  const studies = h.filter((e) => ['new', 'practiced', 'reviewed'].includes(e.event)).length;
  const onlyNew = h.every((e) => e.event === 'new');
  const nextDate = addDays(last.date, INTERVALS[Math.min(studies, INTERVALS.length) - 1] ?? 1);
  let state: ReviewState;
  if (last.event === 'consolidated') state = 'consolidated';
  else if (last.event === 'reinforce_needed') state = 'reinforce';
  else if (last.event === 'review_needed') state = 'review';
  else if (daysBetween(nextDate, now) >= 0) state = onlyNew ? 'not_reviewed' : 'review';
  else state = 'scheduled';
  return { ref, state, lastDate: last.date, nextDate, studies };
}

export function reviewBoard(data: UserData): Record<ReviewState, ReviewItem[]> {
  const refs = [...new Set(data.history.map((h) => h.ref))];
  const board: Record<ReviewState, ReviewItem[]> = {
    not_reviewed: [], review: [], reinforce: [], scheduled: [], consolidated: [],
  };
  refs.forEach((r) => {
    const s = reviewStatus(data, r);
    if (s) board[s.state].push(s);
  });
  return board;
}

/** Tipo de sessão sugerido para montar a partir de um estado. */
export const SUGGESTED_KIND: Record<ReviewState, SessionKind> = {
  not_reviewed: 'review',
  review: 'review',
  reinforce: 'reinforce',
  scheduled: 'practice',
  consolidated: 'consolidate',
};
