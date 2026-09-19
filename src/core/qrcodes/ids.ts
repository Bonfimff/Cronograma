import type { UserData } from '../types';

/**
 * O QR Code contém só o identificador (ex.: "ENG-2026-0001"), nunca uma URL.
 * Assim a folha continua válida mesmo se a aplicação mudar de endereço.
 */
export const CODE_RE = /^ENG-(\d{4})-(\d{4,})$/;

export function isCode(text: string): boolean {
  return CODE_RE.test(normalizeCode(text));
}

/** Aceita também URLs/textos que contenham o código (tolerância para QR de terceiros). */
export function normalizeCode(text: string): string {
  const m = text.toUpperCase().match(/ENG-\d{4}-\d{4,}/);
  return m ? m[0] : text.trim().toUpperCase();
}

/** Conteúdo do QR de cada página: frente = código; verso = código + "/V". */
export const qrPayload = (code: string, page: 'front' | 'back' = 'front') => (page === 'back' ? `${code}/V` : code);
export const isBackPayload = (text: string) => /\/V\s*$/i.test(text.trim());

/** Reserva o próximo código do ano (muta o rascunho). */
export function nextCode(draft: UserData, year = new Date().getFullYear()): string {
  const used = new Set([...draft.sessions.map((s) => s.id), ...draft.worksheets.map((w) => w.id)]);
  let code: string;
  do {
    const n = (draft.counter[year] ?? 0) + 1;
    draft.counter[year] = n;
    code = `ENG-${year}-${String(n).padStart(4, '0')}`;
  } while (used.has(code)); // pula códigos já usados por folhas avulsas
  return code;
}
