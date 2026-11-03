/**
 * Vozes masculinas bilíngues, que rodam no próprio navegador. Quem escolhe entre elas é a
 * pessoa: a tela mostra o peso do download e a velocidade medida no aparelho dela.
 */

import { api } from '../../api/client';
import { session } from '../../api/session';

export type MotorBilingue = 'servidor' | 'kokoro' | 'supertonic';

export interface VozBilingue {
  id: string; // "motor:nome"
  nome: string;
  motor: MotorBilingue;
}

export const VOZES_BILINGUES: VozBilingue[] = [
  { id: 'servidor:M1', nome: 'Voz M1', motor: 'servidor' },
  { id: 'servidor:M2', nome: 'Voz M2', motor: 'servidor' },
  { id: 'servidor:M3', nome: 'Voz M3', motor: 'servidor' },
  { id: 'servidor:M4', nome: 'Voz M4', motor: 'servidor' },
  { id: 'servidor:M5', nome: 'Voz M5', motor: 'servidor' },
  { id: 'kokoro:pm_alex', nome: 'Alex', motor: 'kokoro' },
  { id: 'kokoro:pm_santa', nome: 'Santa', motor: 'kokoro' },
  { id: 'supertonic:M1', nome: 'Voz M1', motor: 'supertonic' },
  { id: 'supertonic:M2', nome: 'Voz M2', motor: 'supertonic' },
  { id: 'supertonic:M3', nome: 'Voz M3', motor: 'supertonic' },
  { id: 'supertonic:M4', nome: 'Voz M4', motor: 'supertonic' },
  { id: 'supertonic:M5', nome: 'Voz M5', motor: 'supertonic' },
];

export const SOBRE_MOTOR: Record<MotorBilingue, { titulo: string; peso: string; texto: string }> = {
  servidor: {
    titulo: 'Servidor',
    peso: 'sem download',
    texto: 'A mais fluida: as vozes do Supertonic geradas fora do celular, que só toca o áudio. Precisa de internet e de conta. Se o servidor estiver fora do ar, usa a voz baixada ou a do aparelho.',
  },
  kokoro: {
    titulo: 'Kokoro',
    peso: 'cerca de 92 MB',
    texto: 'Mais leve. O inglês sai com os sons do inglês, mas gerar a fala é bem mais lento, e cada frase demora a começar.',
  },
  supertonic: {
    titulo: 'Supertonic',
    peso: 'cerca de 398 MB',
    texto: 'Soa mais natural e gera a fala bem mais rápido em aparelhos com WebGPU, mas o download é grande e usa mais memória. O inglês no meio da frase sai com sotaque de português.',
  },
};

export const amostraBilingue = (id: string) => `${import.meta.env.BASE_URL}vozes/${id.replace('servidor:', 'supertonic:').replace(':', '-')}.mp3`;
const noServidor = (id: string) => id.startsWith('servidor:');

type Resposta = {
  type: string; id: number; valor?: number | boolean; amostras?: Float32Array; taxa?: number; gasto?: number; mensagem?: string;
  modo?: Medida['modo']; motivo?: string; nucleos?: number; carga?: number;
};

let worker: Worker | undefined;
let proximo = 1;
const pendentes = new Map<number, { ok: (r: Resposta) => void; falha: (e: Error) => void; progresso?: (f: number) => void }>();

function iniciar(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./bilingue.worker.ts', import.meta.url), { type: 'module' });
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

export async function baixarBilingue(id: string, progresso?: (f: number) => void): Promise<void> {
  if (noServidor(id)) return;
  await pedir({ type: 'baixar', voz: id }, progresso);
  baixadas.add(id);
}

export async function bilingueBaixada(id: string): Promise<boolean> {
  if (noServidor(id)) return true;
  if (baixadas.has(id)) return true;
  try {
    const r = await pedir({ type: 'baixada', voz: id });
    if (r.valor) baixadas.add(id);
    return !!r.valor;
  } catch {
    return false;
  }
}

/** Apaga o modelo do motor inteiro: é ele que ocupa espaço, e as vozes o dividem. */
export async function removerMotor(motor: MotorBilingue): Promise<void> {
  for (const v of VOZES_BILINGUES.filter((x) => x.motor === motor)) {
    await pedir({ type: 'remover', voz: v.id });
    baixadas.delete(v.id);
  }
}

const KEY_DESEMPENHO = 'ingles-hibrido:vozes-desempenho';

/** O que foi medido neste aparelho, para a pessoa escolher e para saber por que está lento. */
export interface Medida {
  /** segundos de fala gerados por segundo; fica a melhor, porque a primeira ainda prepara a placa */
  velocidade?: number;
  modo?: 'placa' | 'processador' | 'servidor';
  motivo?: string;
  nucleos?: number;
  /** quanto levou para abrir o modelo na memória, em segundos */
  carga?: number;
}

export function desempenho(): Partial<Record<MotorBilingue, Medida>> {
  try { return JSON.parse(localStorage.getItem(KEY_DESEMPENHO) ?? '{}'); } catch { return {}; }
}

function anotar(id: string, r: Resposta, velocidade?: number) {
  try {
    const motor = id.split(':')[0] as MotorBilingue;
    const medidas = desempenho();
    const antes = medidas[motor];
    const mesmaForma = antes?.modo === r.modo && antes?.nucleos === r.nucleos;
    medidas[motor] = {
      modo: r.modo,
      motivo: r.motivo,
      nucleos: r.nucleos,
      carga: r.carga || (mesmaForma ? antes?.carga : undefined),
      velocidade: Math.max(mesmaForma ? antes?.velocidade ?? 0 : 0, velocidade ?? 0) || undefined,
    };
    localStorage.setItem(KEY_DESEMPENHO, JSON.stringify(medidas));
  } catch { /* sem armazenamento */ }
}

// v2: a primeira versão contava o tempo de carregar o modelo e desligava a placa à toa
const KEY_SEM_PLACA = 'ingles-hibrido:vozes-sem-placa-v2';
/**
 * Sem resposta nesse tempo, travou: a placa de vídeo de alguns aparelhos para sem dar erro.
 * Abrir o modelo é bem mais demorado que gerar uma frase, e no processador uma frase também
 * pode levar minutos sem estar travada: nesse caso o limite maior é só para não esperar para sempre.
 */
const LIMITE_CARGA_MS = 120_000;
const LIMITE_FRASE_PROCESSADOR_MS = 300_000;
const KEY_UM_NUCLEO = 'ingles-hibrido:vozes-um-nucleo';
const LIMITE_FRASE_MS = 120_000;

function lerSemPlaca(): boolean {
  try { return localStorage.getItem(KEY_SEM_PLACA) === '1'; } catch { return false; }
}

function destravar() {
  try {
    // o que travou? Abrindo o modelo, na primeira vez sem a placa, foram as threads
    const seguro = lerSemPlaca() ? KEY_UM_NUCLEO : KEY_SEM_PLACA;
    localStorage.setItem(seguro, '1');
    localStorage.removeItem(KEY_DESEMPENHO); // as medidas anteriores não valem mais
  } catch { /* sem armazenamento */ }
  worker?.terminate();
  worker = undefined;
  preparada = undefined;
  pendentes.forEach((p) => p.falha(new Error('A geração da voz travou.')));
  pendentes.clear();
}

let preparada: { id: string; pronta: Promise<Resposta> } | undefined;
let modoAtual: Resposta['modo'];

function comLimite(msg: Record<string, unknown>, limite: number): Promise<Resposta> {
  const relogio = window.setTimeout(destravar, limite);
  let umNucleo = false;
  try { umNucleo = localStorage.getItem(KEY_UM_NUCLEO) === '1'; } catch { /* sem armazenamento */ }
  return pedir({ ...msg, semPlaca: lerSemPlaca(), umNucleo }).finally(() => window.clearTimeout(relogio));
}

/** Abre o modelo na memória antes da primeira fala; pode ser chamada de novo sem custo. */
export function prepararBilingue(id: string): Promise<Resposta> {
  if (noServidor(id)) return Promise.resolve({ type: 'pronto', id: 0 });
  if (preparada?.id === id) return preparada.pronta;
  const pronta = comLimite({ type: 'preparar', voz: id }, LIMITE_CARGA_MS);
  const atual = { id, pronta };
  preparada = atual;
  pronta.then((r) => { modoAtual = r.modo; anotar(id, r); }, () => { if (preparada === atual) preparada = undefined; });
  return pronta;
}

// uma frase de cada vez: o relógio de cada uma só começa quando chega a vez dela
let fila: Promise<unknown> = Promise.resolve();

type Partes = { texto: string; lingua: 'pt' | 'en' }[];
const LIMITE_SERVIDOR_MS = 30_000;

async function doServidor(id: string, partes: Partes, velocidade: number): Promise<{ amostras: Float32Array; taxa: number }> {
  const parar = new AbortController();
  const relogio = window.setTimeout(() => parar.abort(), LIMITE_SERVIDOR_MS);
  const t0 = performance.now();
  try {
    const mp3 = await session.withToken((token) => api.voz(token, {
      texto: partes.map((p) => p.texto).join('').trim().slice(0, 600),
      lingua: partes.every((p) => p.lingua === 'en') ? 'en' : 'pt',
      voz: id.split(':')[1],
      // a tartaruga pede menos que isso; o servidor só aceita de 0,5x a 2x
      velocidade: Math.max(0.5, Math.min(2, velocidade)),
    }, parar.signal));
    const audio = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(mp3);
    const amostras = audio.getChannelData(0);
    anotar(id, { type: 'pronto', id: 0, modo: 'servidor' }, audio.duration / ((performance.now() - t0) / 1000));
    return { amostras, taxa: audio.sampleRate };
  } finally {
    window.clearTimeout(relogio);
  }
}

export function sintetizarBilingue(
  id: string, partes: Partes, velocidade: number,
): Promise<{ amostras: Float32Array; taxa: number }> {
  if (noServidor(id)) {
    return doServidor(id, partes, velocidade).catch(async (e) => {
      anotar(id, { type: 'pronto', id: 0, modo: 'servidor', motivo: 'fora do ar na última tentativa' });
      // sem servidor, a mesma voz baixada no aparelho; sem ela, quem chamou usa a do sistema
      const local = id.replace('servidor:', 'supertonic:');
      if (await bilingueBaixada(local)) return sintetizarBilingue(local, partes, velocidade);
      throw e;
    });
  }
  const vez = fila.catch(() => undefined).then(async () => {
    await prepararBilingue(id);
    const r = await comLimite({ type: 'falar', voz: id, partes, velocidade }, modoAtual === 'placa' ? LIMITE_FRASE_MS : LIMITE_FRASE_PROCESSADOR_MS);
    const amostras = r.amostras!;
    const taxa = r.taxa!;
    anotar(id, r, amostras.length / taxa / r.gasto!);
    return { amostras, taxa };
  });
  fila = vez;
  return vez;
}
