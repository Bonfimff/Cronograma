import type { Session, UserData, Worksheet } from '../types';
import { nextCode, normalizeCode } from '../qrcodes/ids';
import { DEFAULT_TEMPLATE_ID } from './templates';

/** Folha de uma sessão: mesmo código da sessão. Cria o registro se ainda não existir. */
export function ensureSheetForSession(draft: UserData, session: Session, templateId = DEFAULT_TEMPLATE_ID): Worksheet {
  let w = draft.worksheets.find((x) => x.sessionId === session.id);
  if (!w) {
    w = { id: session.id, templateId, sessionId: session.id, createdAt: new Date().toISOString() };
    draft.worksheets.push(w);
  }
  return w;
}

/** Folhas em branco: códigos reservados para associar a uma sessão no primeiro escaneamento. */
export function createBlankSheets(draft: UserData, count: number, templateId = DEFAULT_TEMPLATE_ID): Worksheet[] {
  return Array.from({ length: count }, () => {
    const w: Worksheet = { id: nextCode(draft), templateId, sessionId: null, createdAt: new Date().toISOString() };
    draft.worksheets.push(w);
    return w;
  });
}

export function markPrinted(draft: UserData, ids: string[]): void {
  const now = new Date().toISOString();
  draft.worksheets.forEach((w) => {
    if (ids.includes(w.id)) w.printedAt = now;
  });
}

export type ScanLookup =
  | { state: 'unknown'; code: string }
  | { state: 'unassigned'; code: string; sheet: Worksheet }
  | { state: 'ready' | 'in_progress' | 'done'; code: string; sheet?: Worksheet; session: Session };

/** QR → Folha → Sessão. */
export function lookupCode(data: UserData, raw: string): ScanLookup {
  const code = normalizeCode(raw);
  const sheet = data.worksheets.find((w) => w.id === code);
  const session = data.sessions.find((s) => s.id === (sheet?.sessionId ?? code));
  if (session) {
    const state = session.status === 'planned' ? 'ready' : session.status;
    return { state, code, sheet, session };
  }
  if (sheet) return { state: 'unassigned', code, sheet };
  return { state: 'unknown', code };
}

export function assignSheet(draft: UserData, code: string, sessionId: string): void {
  let w = draft.worksheets.find((x) => x.id === code);
  if (!w) {
    w = { id: code, templateId: DEFAULT_TEMPLATE_ID, sessionId: null, createdAt: new Date().toISOString() };
    draft.worksheets.push(w);
  }
  w.sessionId = sessionId;
}
