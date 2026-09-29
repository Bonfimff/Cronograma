/**
 * Sincronização com o servidor.
 *
 * O banco é a fonte: o conteúdo de estudo, as folhas da Biblioteca, o
 * planejamento e o histórico vivem lá. O aparelho guarda uma cópia para o
 * aplicativo continuar funcionando sem internet, e manda para o servidor tudo o
 * que foi criado enquanto estava fora do ar.
 *
 * Cada coisa vira um registro com um tipo e um código: "content" guarda um item
 * por vez ("words:how"), então duas pessoas mexendo em palavras diferentes não
 * brigam. O servidor conta revisões: pedimos só o que mudou desde a última que
 * este aparelho aplicou.
 */

import type { ContentBundle, LibrarySheet, Session, UserData, Week, Worksheet, HistoryEntry } from '../types';
import type { SyncRecord } from './client';
import { session } from './session';
import { store } from '../storage/store';

const CONTENT_KEYS: (keyof ContentBundle)[] = ['words', 'expressions', 'patterns', 'grammar', 'examples', 'topics', 'exercises'];

export interface ResultadoSync {
  baixados: number;
  enviados: number;
  revisao: number;
}

/** Tudo o que este aparelho tem, no formato de registros do servidor. */
function registrosLocais(d: UserData): SyncRecord[] {
  const saida: SyncRecord[] = [];

  CONTENT_KEYS.forEach((chave) => {
    ((d.content?.[chave] ?? []) as { id: string }[]).forEach((item) => {
      saida.push({ kind: 'content', id: `${chave}:${item.id}`, data: item as unknown as Record<string, unknown> });
    });
  });
  (d.sheets ?? []).forEach((s) => saida.push({ kind: 'sheet', id: s.id, data: s as unknown as Record<string, unknown> }));
  d.weeks.forEach((w) => saida.push({ kind: 'week', id: w.id, data: w as unknown as Record<string, unknown> }));
  d.sessions.forEach((s) => saida.push({ kind: 'session', id: s.id, data: s as unknown as Record<string, unknown> }));
  d.worksheets.forEach((w) => saida.push({ kind: 'worksheet', id: w.id, data: w as unknown as Record<string, unknown> }));
  d.history.forEach((h) => saida.push({ kind: 'history', id: h.id, data: h as unknown as Record<string, unknown> }));

  return saida;
}

/** Aplica no aparelho o que veio do servidor. */
function aplicar(itens: SyncRecord[]): void {
  if (!itens.length) return;
  store.update((d) => {
    d.content ??= {};
    for (const item of itens) {
      const dados = item.data as Record<string, unknown> & { id?: string };
      if (item.kind === 'content') {
        const [chave, ...resto] = item.id.split(':');
        const lista = chave as keyof ContentBundle;
        if (!CONTENT_KEYS.includes(lista)) continue;
        const id = resto.join(':');
        const antigos: { id: string }[] = (d.content[lista] ?? []) as unknown as { id: string }[];
        const atual = antigos.filter((x) => x.id !== id);
        d.content = { ...d.content, [lista]: item.deleted ? atual : [...atual, dados as unknown as { id: string }] };
      } else if (item.kind === 'sheet') {
        d.sheets = [...(d.sheets ?? []).filter((s) => s.id !== item.id), ...(item.deleted ? [] : [dados as unknown as LibrarySheet])];
      } else if (item.kind === 'week') {
        d.weeks = [...d.weeks.filter((w) => w.id !== item.id), ...(item.deleted ? [] : [dados as unknown as Week])];
      } else if (item.kind === 'session') {
        d.sessions = [...d.sessions.filter((s) => s.id !== item.id), ...(item.deleted ? [] : [dados as unknown as Session])];
      } else if (item.kind === 'worksheet') {
        d.worksheets = [...d.worksheets.filter((w) => w.id !== item.id), ...(item.deleted ? [] : [dados as unknown as Worksheet])];
      } else if (item.kind === 'history') {
        d.history = [...d.history.filter((h) => h.id !== item.id), ...(item.deleted ? [] : [dados as unknown as HistoryEntry])];
      }
    }
  });
}

const NOME_APARELHO = (() => {
  try {
    const chave = 'ingles-hibrido:aparelho';
    let id = localStorage.getItem(chave);
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem(chave, id); }
    return id;
  } catch {
    return 'aparelho';
  }
})();

/**
 * O que este aparelho já mandou ao servidor, para não reenviar tudo a cada vez:
 * código do registro -> conteúdo dele quando foi aceito.
 */
const VISTO_KEY = 'ingles-hibrido:sync-visto';

function lerVisto(): Record<string, string> {
  try {
    const raw = localStorage.getItem(VISTO_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function guardarVisto(v: Record<string, string>): void {
  try { localStorage.setItem(VISTO_KEY, JSON.stringify(v)); } catch { /* sem armazenamento */ }
}

const codigo = (r: { kind: string; id: string }) => `${r.kind}/${r.id}`;

/** Só o que mudou desde a última vez, mais o que sumiu daqui (vira apagado lá). */
function pendentes(locais: SyncRecord[], visto: Record<string, string>): SyncRecord[] {
  const agora = new Map(locais.map((r) => [codigo(r), JSON.stringify(r.data)]));
  const saida: SyncRecord[] = [];

  locais.forEach((r) => {
    if (visto[codigo(r)] !== JSON.stringify(r.data)) saida.push(r);
  });
  Object.keys(visto).forEach((chave) => {
    if (agora.has(chave)) return;
    const [kind, ...resto] = chave.split('/');
    saida.push({ kind: kind as SyncRecord['kind'], id: resto.join('/'), data: {}, deleted: true });
  });

  return saida;
}

let rodando: Promise<ResultadoSync> | null = null;

/**
 * Traz o que mudou no servidor e manda o que este aparelho tem.
 *
 * Na primeira vez (revisão 0) tudo o que está no aparelho sobe: é assim que o
 * material antigo entra no banco sem precisar de conversão à mão.
 */
export function sincronizar(): Promise<ResultadoSync> {
  if (rodando) return rodando;
  rodando = (async () => {
    const antes = session.get().revision;
    const baixado = await session.withToken((t) => session.api.pull(t, antes));
    aplicar(baixado.items);

    const visto = lerVisto();
    const locais = registrosLocais(store.get());
    const mandar = pendentes(locais, visto);

    let revisao = baixado.revision;
    let enviados = 0;
    if (mandar.length) {
      const enviado = await session.withToken((t) => session.api.push(t, baixado.revision, mandar, NOME_APARELHO));
      // o servidor devolve o que recusou (mudou lá enquanto isso): vale o dele
      aplicar(enviado.items);
      revisao = enviado.revision;
      enviados = enviado.saved;
    }

    // o que está no aparelho agora é o que o servidor conhece
    const depois = registrosLocais(store.get());
    guardarVisto(Object.fromEntries(depois.map((r) => [codigo(r), JSON.stringify(r.data)])));
    session.setRevision(revisao);

    return { baixados: baixado.items.length, enviados, revisao };
  })().finally(() => { rodando = null; });
  return rodando;
}
