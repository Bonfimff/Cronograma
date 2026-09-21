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
  // várias folhas criadas no mesmo milissegundo (importação) não podem repetir o id
  const taken = new Set((draft.sheets ?? []).map((s) => s.id));
  const base = `sheet-${Date.now().toString(36)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  draft.sheets = [...(draft.sheets ?? []), { id, title: name, items: [] }];
  return id;
}

export function deleteSheet(draft: UserData, id: string): void {
  draft.sheets = (draft.sheets ?? []).filter((s) => s.id !== id);
}

/**
 * Junta folhas vindas de um arquivo: mesmo título (sem diferenciar maiúsculas)
 * soma as entradas novas na folha que já existe; título novo cria folha.
 * Entradas repetidas (mesmo inglês e português) não entram de novo.
 */
export function mergeSheets(draft: UserData, incoming: { title: string; items: { en: string; pt: string }[] }[]): void {
  incoming.forEach((inc) => {
    const key = inc.title.trim().toLowerCase();
    let sheet = (draft.sheets ?? []).find((s) => s.title.trim().toLowerCase() === key);
    if (!sheet) {
      const id = createSheet(draft, inc.title);
      sheet = draft.sheets!.find((s) => s.id === id)!;
    }
    const keyOf = (en: string, pt: string) => `${en.toLowerCase()}|${pt.toLowerCase()}`;
    const has = new Set(sheet.items.map((i) => keyOf(i.en.trim(), i.pt.trim())));
    const add: { en: string; pt: string }[] = [];
    for (const raw of inc.items) {
      const en = raw.en.trim();
      const pt = raw.pt.trim();
      if (!en || !pt || has.has(keyOf(en, pt))) continue;
      has.add(keyOf(en, pt));
      add.push({ en, pt });
    }
    const id = sheet.id;
    draft.sheets = draft.sheets!.map((s) => (s.id === id ? { ...s, items: [...s.items, ...add] } : s));
  });
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
