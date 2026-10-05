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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Uma palavra marcada na resposta: o que mostrar no balão ao tocar nela. */
export interface GlossaryItem {
  en: string;
  pt: string;
  id: string;
}

export type SyncKind = 'week' | 'session' | 'worksheet' | 'history' | 'sheet' | 'content' | 'game' | 'chat' | 'activity';

export interface Pessoa { id: number; email: string }
export interface Acessos { professores: Pessoa[]; alunos: Pessoa[] }

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
  if (campo === 'email') return 'E-mail inválido. Confira o endereço (exemplo: nome@dominio.com).';
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

  /** Conversa com o modelo. O histórico vai inteiro: ele não guarda memória. */
  chat(token: string, messages: ChatMessage[], limit?: number): Promise<{ reply: string; glossary: GlossaryItem[] }> {
    return this.call('/chat', { method: 'POST', body: JSON.stringify({ messages, ...(limit ? { limit } : {}) }) }, token);
  }

  /**
   * A mesma conversa, com a resposta chegando enquanto o modelo escreve: `aoVivo` recebe o
   * texto até ali (sem as palavras em inglês, que entram na versão final).
   */
  async chatAoVivo(
    token: string, messages: ChatMessage[], aoVivo: (texto: string) => void, foco: string[] = [],
  ): Promise<{ reply: string; glossary: GlossaryItem[] }> {
    if (!this.configured) throw new ApiError('Este aplicativo foi publicado sem servidor de conta.', 0);
    let res: Response;
    try {
      res = await this.fetcher(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        // foco: as palavras da aula e as quase esquecidas, que o servidor põe primeiro na conversa
        body: JSON.stringify({ messages, ...(foco.length ? { foco: foco.slice(0, 40) } : {}) }),
      });
    } catch {
      throw new ApiError('Servidor fora do ar ou sem internet.', 0);
    }
    if (res.status === 404) return this.chat(token, messages); // servidor antigo, sem a rota nova
    if (!res.ok || !res.body) throw new ApiError(await readError(res), res.status);
    const leitor = res.body.getReader();
    const dec = new TextDecoder();
    let resto = '';
    for (;;) {
      const { done, value } = await leitor.read();
      resto += dec.decode(value ?? new Uint8Array(), { stream: !done });
      const linhas = resto.split('\n');
      resto = linhas.pop() ?? '';
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        const item = JSON.parse(linha) as { parcial?: string; final?: { reply: string; glossary: GlossaryItem[] }; erro?: string; status?: number };
        if (item.parcial !== undefined) aoVivo(item.parcial);
        if (item.final) return item.final;
        if (item.erro) throw new ApiError(item.erro, item.status ?? 500);
      }
      if (done) break;
    }
    throw new ApiError('A resposta foi interrompida.', 0);
  }

  /** O modelo está alcançável agora? */
  chatSaude(token: string): Promise<{ ok: boolean }> {
    return this.call('/chat/saude', {}, token);
  }

  /** A IA lê o resumo dos números do progresso e escreve a análise (5 tópicos). */
  /** Quem pode ver o meu histórico, e de quem eu posso ver (professor). */
  acessos(token: string): Promise<Acessos> {
    return this.call('/acesso', {}, token);
  }

  autorizarProfessor(token: string, email: string): Promise<Acessos> {
    return this.call('/acesso', { method: 'POST', body: JSON.stringify({ email }) }, token);
  }

  revogarProfessor(token: string, professorId: number): Promise<Acessos> {
    return this.call(`/acesso/${professorId}`, { method: 'DELETE' }, token);
  }

  /** Os registros de um aluno que me autorizou (só leitura). */
  dadosDoAluno(token: string, alunoId: number): Promise<SyncRecord[]> {
    return this.call(`/acesso/alunos/${alunoId}`, {}, token);
  }

  analiseProgresso(token: string, resumo: string): Promise<{ texto: string; fonte: string }> {
    return this.call('/progresso/analise', { method: 'POST', body: JSON.stringify({ resumo }) }, token);
  }

  /** O reconhecedor de voz do servidor está alcançável agora? */
  falaSaude(token: string): Promise<{ ok: boolean }> {
    return this.call('/fala/saude', {}, token);
  }

  /** Reconhece um trecho de áudio (PCM float32, 16 kHz, mono) no servidor. */
  transcrever(token: string, samples: Float32Array): Promise<{ text: string }> {
    const body = samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength) as ArrayBuffer;
    return this.call('/fala/transcrever', { method: 'POST', body, headers: { 'content-type': 'application/octet-stream' } }, token);
  }}

export const api = new Api({ baseUrl: import.meta.env.VITE_API_URL ?? '' });
