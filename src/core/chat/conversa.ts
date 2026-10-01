/**
 * A conversa guardada neste aparelho.
 *
 * O modelo não tem memória: a cada pergunta o histórico vai junto. Guardamos
 * aqui para a conversa continuar depois de fechar o aplicativo, e cortamos as
 * falas mais antigas porque o modelo lê só 4096 tokens de contexto.
 */

import type { ChatMessage } from '../api/client';

const KEY = 'ingles-hibrido:conversa:v1';
/** quantas falas vão para o modelo (as mais recentes) */
export const JANELA = 16;

export function lerConversa(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(v) ? v.filter((m) => m && typeof m.content === 'string') : [];
  } catch {
    return [];
  }
}

export function guardarConversa(falas: ChatMessage[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(falas.slice(-80))); } catch { /* sem armazenamento */ }
}

/** O pedaço que vai para o modelo. */
export const recorte = (falas: ChatMessage[]): ChatMessage[] => falas.slice(-JANELA);
