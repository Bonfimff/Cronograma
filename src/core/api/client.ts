/**
 * Cliente da API (server/): contas e, adiante, sincronização.
 *
 * Nada aqui depende de React. O endereço do servidor vem da variável
 * VITE_API_URL na build; sem ela, o app funciona normalmente — só sem conta.
 */

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface Account {
  id: number;
  email: string;
  revision: number;
  records: number;
}

export type SyncKind = 'week' | 'session' | 'worksheet' | 'history' | 'sheet' | 'content' | 'game';

export interface SyncRecord {
  kind: SyncKind;
  id: string;
  data: Record<string, unknown>;
  deleted?: boolean;
  revision?: number;
}

/** Erro com a mensagem que o servidor devolveu (já em português). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

const MESSAGES: Record<number, string> = {
  401: 'E-mail ou senha incorretos.',
  409: 'Já existe uma conta com esse e-mail.',
  422: 'Confira o e-mail e a senha.',
  429: 'Muitas tentativas. Espere um pouco e tente de novo.',
};

/** Erro de validação do FastAPI: diz qual campo está errado, em vez de culpar os dois. */
function fieldMessage(detail: { loc?: unknown[]; msg?: string }[]): string {
  const campo = String(detail[0]?.loc?.[1] ?? '');
  if (campo === 'email') return 'E-mail inválido — confira o endereço (exemplo: nome@dominio.com).';
  if (campo === 'password') return 'A senha precisa de pelo menos 8 caracteres.';
  return MESSAGES[422];
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) return fieldMessage(detail);
  } catch {
    /* resposta sem JSON */
  }
  return MESSAGES[res.status] ?? `Falha na conexão com o servidor (${res.status}).`;
}

export interface ApiOptions {
  baseUrl?: string;
  /** trocável nos testes */
  fetcher?: typeof fetch;
}

export class Api {
  readonly baseUrl: string;
  private fetcher: typeof fetch;

  constructor(opts: ApiOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/$/, '');
    this.fetcher = opts.fetcher ?? ((...a) => fetch(...a));
  }

  /** O app foi publicado com um servidor configurado? */
  get configured(): boolean {
    return !!this.baseUrl;
  }

  private async call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    if (!this.configured) throw new ApiError('Este aplicativo foi publicado sem servidor de conta.', 0);
    let res: Response;
    try {
      res = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiError('Servidor fora do ar ou sem internet.', 0);
    }
    if (!res.ok) throw new ApiError(await readError(res), res.status);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  register(email: string, password: string): Promise<Tokens> {
    return this.call('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
  }

  login(email: string, password: string): Promise<Tokens> {
    return this.call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  }

  refresh(refreshToken: string): Promise<Tokens> {
    return this.call('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
  }

  me(token: string): Promise<Account> {
    return this.call('/auth/me', {}, token);
  }

  logoutAll(token: string): Promise<void> {
    return this.call('/auth/logout-all', { method: 'POST' }, token);
  }

  pull(token: string, since: number): Promise<{ revision: number; items: SyncRecord[] }> {
    return this.call(`/sync/pull?since=${since}`, {}, token);
  }

  push(
    token: string,
    since: number,
    items: SyncRecord[],
    device?: string,
  ): Promise<{ revision: number; saved: number; ignored: number; items: SyncRecord[] }> {
    return this.call('/sync/push', { method: 'POST', body: JSON.stringify({ since, items, device }) }, token);
  }
}

export const api = new Api({ baseUrl: import.meta.env.VITE_API_URL ?? '' });
