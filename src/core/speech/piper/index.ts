/**
 * Vozes naturais (Piper) que rodam no próprio navegador.
 *
 * Cada voz tem uma amostra curta em /vozes, para ouvir antes de escolher. Ao
 * escolher, o modelo é baixado uma vez (~60 MB) e fica guardado no aparelho.
 */

export interface VozNatural {
  id: string;          // nome do modelo no Piper
  nome: string;        // como aparece no app
  lingua: 'pt' | 'en';
  sotaque: string;
}

export const VOZES_NATURAIS: VozNatural[] = [
  { id: 'pt_BR-faber-medium', nome: 'Fábio', lingua: 'pt', sotaque: 'Português brasileiro' },
  { id: 'pt_BR-cadu-medium', nome: 'Cadu', lingua: 'pt', sotaque: 'Português brasileiro' },
  { id: 'pt_BR-jeff-medium', nome: 'Jefferson', lingua: 'pt', sotaque: 'Português brasileiro' },
  { id: 'en_US-ryan-medium', nome: 'Ryan', lingua: 'en', sotaque: 'Inglês americano' },
  { id: 'en_US-joe-medium', nome: 'Joe', lingua: 'en', sotaque: 'Inglês americano' },
  { id: 'en_US-john-medium', nome: 'John', lingua: 'en', sotaque: 'Inglês americano' },
  { id: 'en_US-bryce-medium', nome: 'Bryce', lingua: 'en', sotaque: 'Inglês americano' },
  { id: 'en_US-norman-medium', nome: 'Norman', lingua: 'en', sotaque: 'Inglês americano, voz madura' },
  { id: 'en_US-kusal-medium', nome: 'Kusal', lingua: 'en', sotaque: 'Inglês com sotaque do sul da Ásia' },
  { id: 'en_GB-alan-medium', nome: 'Alan', lingua: 'en', sotaque: 'Inglês britânico' },
  { id: 'en_GB-northern_english_male-medium', nome: 'Harry', lingua: 'en', sotaque: 'Inglês britânico, norte da Inglaterra' },
];

/** Prefixo que marca, nos ajustes, uma voz natural (as do aparelho são guardadas pelo nome). */
export const PREFIXO_NATURAL = 'natural:';

export const amostraDe = (id: string) => `${import.meta.env.BASE_URL}vozes/${id}.mp3`;

let worker: Worker | undefined;
let proximo = 1;
type Resposta = { type: string; id: number; valor?: number | boolean; amostras?: Float32Array; taxa?: number; mensagem?: string };
const pendentes = new Map<number, { ok: (r: Resposta) => void; falha: (e: Error) => void; progresso?: (f: number) => void }>();

function iniciar(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<Resposta>) => {
    const r = e.data;
    const p = pendentes.get(r.id);
    if (!p) return;
    if (r.type === 'progresso') { p.progresso?.(Number(r.valor)); return; }
    pendentes.delete(r.id);
    if (r.type === 'erro') p.falha(new Error(r.mensagem));
    else p.ok(r);
  };
  return worker;
}

function pedir(msg: Record<string, unknown>, progresso?: (f: number) => void): Promise<Resposta> {
  const id = proximo++;
  return new Promise((ok, falha) => {
    pendentes.set(id, { ok, falha, progresso });
    iniciar().postMessage({ ...msg, id });
  });
}

const baixadas = new Set<string>();

/** Baixa o modelo (uma vez) e deixa a voz pronta para falar. */
export async function baixarVoz(id: string, progresso?: (f: number) => void): Promise<void> {
  await pedir({ type: 'baixar', voz: id }, progresso);
  baixadas.add(id);
}

export async function vozBaixada(id: string): Promise<boolean> {
  if (baixadas.has(id)) return true;
  try {
    const r = await pedir({ type: 'baixada', voz: id });
    if (r.valor) baixadas.add(id);
    return !!r.valor;
  } catch {
    return false;
  }
}

export async function removerVoz(id: string): Promise<void> {
  await pedir({ type: 'remover', voz: id });
  baixadas.delete(id);
}

/** Gera o áudio de um texto. Devolve amostras PCM e a taxa. */
export async function sintetizar(id: string, texto: string, velocidade: number): Promise<{ amostras: Float32Array; taxa: number }> {
  const r = await pedir({ type: 'falar', voz: id, texto, velocidade });
  return { amostras: r.amostras!, taxa: r.taxa! };
}