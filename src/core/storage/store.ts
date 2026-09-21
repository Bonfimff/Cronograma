import type { UserData } from '../types';

/**
 * Adaptador de persistência. Hoje: localStorage.
 * Amanhã: arquivo (Capacitor Filesystem), SQLite, ou sincronização com servidor —
 * basta implementar esta interface; o resto do sistema não muda.
 */
export interface StorageAdapter {
  load(): UserData | null;
  save(data: UserData): void;
}

const KEY = 'ingles-hibrido:data:v1';

export const localStorageAdapter: StorageAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as UserData) : null;
    } catch {
      return null;
    }
  },
  save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* armazenamento indisponível: mantém em memória */
    }
  },
};

export const emptyData = (): UserData => ({
  version: 1, counter: {}, weeks: [], sessions: [], worksheets: [], history: [],
});

type Listener = (d: UserData) => void;

export class Store {
  private data: UserData;
  private listeners = new Set<Listener>();

  constructor(private adapter: StorageAdapter) {
    this.data = adapter.load() ?? emptyData();
  }

  get(): UserData {
    return this.data;
  }

  /** Toda alteração passa por aqui: recebe um rascunho, persiste e notifica. */
  update(fn: (draft: UserData) => void): void {
    const draft = structuredClone(this.data);
    fn(draft);
    this.data = draft;
    this.adapter.save(draft);
    this.listeners.forEach((l) => l(draft));
  }

  replace(data: UserData): void {
    this.update((d) => Object.assign(d, data));
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const store = new Store(localStorageAdapter);
