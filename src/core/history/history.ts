import type { ContentRef, HistoryEntry, HistoryEvent, Session, UserData } from '../types';

export const EVENT_LABEL: Record<HistoryEvent, string> = {
  new: 'Novo conteúdo',
  practiced: 'Prática',
  reviewed: 'Revisão',
  review_needed: 'Precisa revisar',
  reinforce_needed: 'Precisa reforço',
  consolidated: 'Consolidado',
};

const POSITIVE: HistoryEvent[] = ['new', 'practiced', 'reviewed'];

function push(draft: UserData, ref: ContentRef, date: string, event: HistoryEvent, sessionId: string) {
  draft.history.push({ id: `${sessionId}:${ref}:${event}`, ref, date, event, sessionId });
}

export function entriesFor(data: UserData, ref: ContentRef): HistoryEntry[] {
  return data.history.filter((h) => h.ref === ref).sort((a, b) => a.date.localeCompare(b.date));
}

/** Converte o resultado de uma sessão em eventos por conteúdo. */
export function recordSessionResult(draft: UserData, s: Session): void {
  if (!s.result) return;
  // refaz os eventos se a sessão for finalizada de novo
  draft.history = draft.history.filter((h) => h.sessionId !== s.id);
  const date = (s.finishedAt ?? new Date().toISOString()).slice(0, 10);
  const { mastery, usage } = s.result;

  for (const ref of s.refs) {
    const prior = entriesFor(draft, ref);
    if (prior.length === 0 || s.kind === 'new') push(draft, ref, date, 'new', s.id);

    if (mastery === 'review') push(draft, ref, date, 'review_needed', s.id);
    else if (mastery === 'reinforce') push(draft, ref, date, 'reinforce_needed', s.id);
    else {
      if (s.kind === 'practice') push(draft, ref, date, 'practiced', s.id);
      if (['review', 'reinforce', 'consolidate'].includes(s.kind)) push(draft, ref, date, 'reviewed', s.id);
      const positives = prior.filter((h) => POSITIVE.includes(h.event)).length;
      if (s.kind !== 'new' && usage === 'yes' && positives >= 2) push(draft, ref, date, 'consolidated', s.id);
    }
  }
}
