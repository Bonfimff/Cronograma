import type { ContentRef, Exercise, Session, SessionKind, SessionResult, UserData } from '../types';
import { weekStartOf } from '../dates';
import { nextCode } from '../qrcodes/ids';
import { copyBlock, getTopic } from '../content/repository';
import { recordSessionResult } from '../history/history';

export interface NewSessionInput {
  date: string;
  kind: SessionKind;
  topicId?: string;
  title?: string;
  objective?: string;
  refs?: ContentRef[];
  copyRefs?: ContentRef[];
  whenToUse?: string;
  /** Usa um código já existente (ex.: folha em branco escaneada). */
  code?: string;
}

export function createSession(draft: UserData, input: NewSessionInput): Session {
  const topic = input.topicId ? getTopic(input.topicId) : undefined;
  const refs = input.refs ?? topic?.refs ?? [];
  const s: Session = {
    id: input.code ?? nextCode(draft, Number(input.date.slice(0, 4))),
    date: input.date,
    weekStart: weekStartOf(input.date),
    kind: input.kind,
    topicId: input.topicId,
    title: input.title || topic?.title || 'Sessão',
    objective: input.objective ?? topic?.objective ?? '',
    refs,
    copyRefs: input.copyRefs ?? refs.filter((r) => copyBlock(r)).slice(0, 1), // a folha tem 3 linhas de Conceito principal
    whenToUse: input.whenToUse || undefined,
    status: 'planned',
    createdAt: new Date().toISOString(),
  };
  draft.sessions.push(s);
  return s;
}

/** Salva exercícios criados na plataforma como conteúdo do usuário. */
export function saveUserExercises(draft: UserData, exercises: Exercise[]): void {
  if (!exercises.length) return;
  draft.content ??= {};
  const ids = new Set(exercises.map((e) => e.id));
  draft.content = { ...draft.content, exercises: [...(draft.content.exercises ?? []).filter((e) => !ids.has(e.id)), ...exercises] };
}

export const findSession = (data: UserData, id: string) => data.sessions.find((s) => s.id === id);

export function updateSession(draft: UserData, id: string, patch: Partial<Session>): void {
  const s = findSession(draft, id);
  if (s) Object.assign(s, patch);
}

export function deleteSession(draft: UserData, id: string): void {
  draft.sessions = draft.sessions.filter((s) => s.id !== id);
  draft.worksheets.forEach((w) => {
    if (w.sessionId === id) w.sessionId = null;
  });
}

export function startSession(draft: UserData, id: string): void {
  const s = findSession(draft, id);
  if (s && s.status === 'planned') {
    s.status = 'in_progress';
    s.startedAt = new Date().toISOString();
  }
}

/** Duração sugerida a partir do início registrado. */
export function elapsedMinutes(s: Session): number {
  if (!s.startedAt) return 0;
  return Math.max(1, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000));
}

export function finishSession(draft: UserData, id: string, result: SessionResult): void {
  const s = findSession(draft, id);
  if (!s) return;
  s.status = 'done';
  s.finishedAt = new Date().toISOString();
  s.startedAt ??= s.finishedAt;
  s.result = result;
  recordSessionResult(draft, s);
}

/** Guarda o placar de exercícios feitos na aula até a finalização. */
export function saveExerciseScore(draft: UserData, id: string, total: number, correct: number): void {
  const s = findSession(draft, id);
  if (!s) return;
  s.result = {
    ...(s.result ?? { durationMin: 0, mastery: 'review', source: 'manual' }),
    exercises: { total, correct },
  };
}
