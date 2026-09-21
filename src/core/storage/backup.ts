import type { DayPlan, HistoryEntry, LibrarySheet, Session, UserData, Week, Worksheet } from '../types';
import { normalizeContent } from '../content/normalize';

/**
 * BACKUP — o arquivo com tudo o que é do usuário: os dados do app (UserData) e
 * os dados dos jogos, que ficam em chaves próprias do navegador (recordes e
 * estatística por palavra, que regula a dificuldade do Tetris).
 */

export const BACKUP_FORMAT = 'ingles-hibrido/backup@1';

/** Chaves dos jogos no localStorage. Os jogos leem daqui — um lugar só. */
export const GAME_KEYS = {
  tetrisBest: 'word-tetris-best',
  tetrisWordStats: 'word-tetris-word-stats',
  matchBestStreak: 'word-match-best-streak',
} as const;

export interface BackupFile extends UserData {
  format?: string;
  exportedAt?: string;
  games?: Record<string, string>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = <T>(v: unknown, keep: (x: Record<string, unknown>) => boolean = () => true): T[] =>
  Array.isArray(v) ? (v.filter((x) => isObj(x) && keep(x)) as T[]) : [];

function readGames(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    Object.values(GAME_KEYS).forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    });
  } catch { /* sem storage */ }
  return out;
}

/** Monta o arquivo de backup a partir dos dados atuais. */
export function makeBackup(data: UserData): BackupFile {
  return { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), ...data, games: readGames() };
}

/**
 * Lê um backup e devolve dados prontos para o app — com as listas garantidas e o
 * conteúdo completado —, ou uma mensagem dizendo o que está errado. Aceita
 * backups antigos (sem "format" nem "games").
 */
export function readBackup(text: string): { data: UserData; games: Record<string, string>; dropped: number } | string {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return `JSON inválido: ${(e as Error).message}`; }
  if (!isObj(raw)) return 'O arquivo não é um backup do Inglês Híbrido.';
  if (raw.format !== undefined && raw.format !== BACKUP_FORMAT) {
    return raw.format === 'ingles-hibrido/semana@1'
      ? 'Este arquivo é um pacote semanal — importe em Semana → Montar semana (JSON).'
      : `Formato "${String(raw.format)}" desconhecido.`;
  }
  if (raw.version !== 1 || !Array.isArray(raw.sessions)) return 'O arquivo não é um backup do Inglês Híbrido (falta version 1 ou sessions).';

  const okSession = (s: Record<string, unknown>) => typeof s.id === 'string' && typeof s.date === 'string' && typeof s.kind === 'string';
  const sessions = arr<Session>(raw.sessions, okSession).map((s) => ({
    ...s,
    refs: Array.isArray(s.refs) ? s.refs : [],
    copyRefs: Array.isArray(s.copyRefs) ? s.copyRefs : [],
    status: s.status ?? 'planned',
  }));
  const weeks = arr<Week>(raw.weeks, (w) => typeof w.id === 'string').map((w) => ({
    ...w, goals: typeof w.goals === 'string' ? w.goals : '', days: arr<DayPlan>(w.days, (d) => typeof d.date === 'string'),
  }));
  const data: UserData = {
    version: 1,
    counter: isObj(raw.counter) ? (raw.counter as Record<string, number>) : {},
    weeks,
    sessions,
    worksheets: arr<Worksheet>(raw.worksheets, (w) => typeof w.id === 'string'),
    history: arr<HistoryEntry>(raw.history, (h) => typeof h.ref === 'string' && typeof h.date === 'string'),
    ...(isObj(raw.content) && { content: normalizeContent(raw.content) }),
    sheets: arr<LibrarySheet>(raw.sheets, (s) => typeof s.id === 'string' && typeof s.title === 'string').map((s) => ({
      ...s, items: arr(s.items, (i) => typeof i.en === 'string' && typeof i.pt === 'string'),
    })),
  };
  const games = isObj(raw.games)
    ? Object.fromEntries(Object.entries(raw.games).filter(([k, v]) => (Object.values(GAME_KEYS) as string[]).includes(k) && typeof v === 'string')) as Record<string, string>
    : {};
  const dropped = (raw.sessions as unknown[]).length - sessions.length;
  return { data, games, dropped };
}

/**
 * Grava os dados dos jogos vindos de um backup. Só mexe no que veio no arquivo:
 * backup antigo (sem jogos) não apaga os recordes que já estão aqui.
 */
export function restoreGames(games: Record<string, string>): void {
  try {
    Object.entries(games).forEach(([k, v]) => localStorage.setItem(k, v));
  } catch { /* sem storage */ }
}
