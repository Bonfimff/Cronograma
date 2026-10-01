/**
 * A conversa com o amigo de treino.
 *
 * Fica junto do resto dos dados do usuário, no store, para a sincronização
 * levá-la ao banco e trazê-la nos outros aparelhos. Apagar o histórico apaga
 * para valer: vira ausência, e a sincronização avisa o servidor.
 *
 * O modelo não tem memória: a cada pergunta o histórico vai junto, por isso
 * mandamos só as falas mais recentes, que é o que cabe no contexto dele.
 */

import type { ChatMessage } from '../api/client';
import type { ChatTurn } from '../types';
import { store } from '../storage/store';

/** quantas falas vão para o modelo (as mais recentes) */
export const JANELA = 16;

export const lerConversa = (): ChatTurn[] => store.get().chat ?? [];

const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function acrescentar(fala: Omit<ChatTurn, 'id' | 'at'>): ChatTurn {
  const turno: ChatTurn = { ...fala, id: novoId(), at: new Date().toISOString() };
  store.update((d) => { d.chat = [...(d.chat ?? []), turno]; });
  return turno;
}

export function apagarConversa(): void {
  store.update((d) => { d.chat = []; });
}

/** O pedaço que vai para o modelo, no formato que a API espera. */
export const paraOModelo = (falas: ChatTurn[]): ChatMessage[] =>
  falas.slice(-JANELA).map((f) => ({ role: f.role, content: f.content }));
