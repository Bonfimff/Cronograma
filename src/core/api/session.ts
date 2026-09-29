/**
 * A conta ligada neste aparelho.
 *
 * Guarda os tokens e o e-mail no armazenamento local e avisa quem estiver
 * ouvindo quando isso muda. O token de acesso vence rápido: quando uma chamada
 * é recusada por isso, `withToken` renova com o token longo e tenta de novo, uma
 * vez — se a renovação também falhar, a sessão é encerrada e o app pede login.
 *
 * Nada aqui bloqueia o uso do aplicativo: sem conta, tudo continua funcionando
 * no aparelho, como sempre foi.
 */

import { Api, ApiError, api as defaultApi, type Account, type Tokens } from './client';

const KEY = 'ingles-hibrido:conta:v1';

export interface SessionState {
  email: string | null;
  tokens: Tokens | null;
  /** última revisão do servidor que este aparelho já aplicou */
  revision: number;
}

const EMPTY: SessionState = { email: null, tokens: null, revision: 0 };

function read(): SessionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<SessionState>;
    return { email: v.email ?? null, tokens: v.tokens ?? null, revision: v.revision ?? 0 };
  } catch {
    return EMPTY;
  }
}

type Listener = (s: SessionState) => void;

export class SessionStore {
  private state: SessionState;
  private listeners = new Set<Listener>();

  constructor(private api: Api = defaultApi) {
    this.state = read();
  }

  get(): SessionState {
    return this.state;
  }

  get signedIn(): boolean {
    return !!this.state.tokens;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private set(next: SessionState): void {
    this.state = next;
    try {
      if (next.tokens) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      /* sem armazenamento: a sessão vale só enquanto a aba estiver aberta */
    }
    this.listeners.forEach((l) => l(next));
  }

  async signIn(email: string, password: string): Promise<void> {
    const tokens = await this.api.login(email, password);
    this.set({ email: email.trim().toLowerCase(), tokens, revision: 0 });
  }

  async signUp(email: string, password: string): Promise<void> {
    const tokens = await this.api.register(email, password);
    this.set({ email: email.trim().toLowerCase(), tokens, revision: 0 });
  }

  /** Sai só neste aparelho; os dados locais continuam onde estão. */
  signOut(): void {
    this.set(EMPTY);
  }

  /** Desconecta todos os aparelhos (se um deles se perder). */
  async signOutEverywhere(): Promise<void> {
    try {
      await this.withToken((t) => this.api.logoutAll(t));
    } finally {
      this.set(EMPTY);
    }
  }

  setRevision(revision: number): void {
    if (this.state.tokens) this.set({ ...this.state, revision });
  }

  /**
   * Roda uma chamada com o token de acesso, renovando uma vez se ele tiver vencido.
   */
  async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const tokens = this.state.tokens;
    if (!tokens) throw new ApiError('Entre na sua conta para sincronizar.', 401);
    try {
      return await fn(tokens.access_token);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      let novos: Tokens;
      try {
        novos = await this.api.refresh(tokens.refresh_token);
      } catch {
        this.signOut(); // a renovação também falhou: a sessão acabou mesmo
        throw new ApiError('Sua sessão expirou. Entre de novo.', 401);
      }
      this.set({ ...this.state, tokens: novos });
      return fn(novos.access_token);
    }
  }

  account(): Promise<Account> {
    return this.withToken((t) => this.api.me(t));
  }
}

export const session = new SessionStore();
