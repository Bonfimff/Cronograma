import type { LibrarySheet, UserData } from '../types';

/**
 * Folhas da Biblioteca criadas pelo usuário. Funções puras sobre o rascunho do
 * store (usadas dentro de store.update), no mesmo padrão de sessions/weeks.
 */

export function sheetsOf(data: UserData): LibrarySheet[] {
  return data.sheets ?? [];
}

/** Cria uma folha vazia e devolve o id dela. Título vazio não cria nada. */
export function createSheet(draft: UserData, title: string): string | null {
  const name = title.trim();
  if (!name) return null;
  const id = `sheet-${Date.now().toString(36)}`;
  draft.sheets = [...(draft.sheets ?? []), { id, title: name, items: [] }];
  return id;
}

export function deleteSheet(draft: UserData, id: string): void {
  draft.sheets = (draft.sheets ?? []).filter((s) => s.id !== id);
}

/** Acrescenta uma entrada inglês → português. Precisa dos dois lados preenchidos. */
export function addSheetItem(draft: UserData, id: string, en: string, pt: string): boolean {
  const item = { en: en.trim(), pt: pt.trim() };
  if (!item.en || !item.pt) return false;
  draft.sheets = (draft.sheets ?? []).map((s) => (s.id === id ? { ...s, items: [...s.items, item] } : s));
  return true;
}

export function removeSheetItem(draft: UserData, id: string, index: number): void {
  draft.sheets = (draft.sheets ?? []).map((s) =>
    s.id === id ? { ...s, items: s.items.filter((_, i) => i !== index) } : s);
}
