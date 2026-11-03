/**
 * Vozes masculinas bilíngues, que rodam no próprio navegador. Quem escolhe entre elas é a
 * pessoa: a tela mostra o peso do download e a velocidade medida no aparelho dela.
 */

export type MotorBilingue = 'kokoro' | 'supertonic';

export interface VozBilingue {
  id: string; // "motor:nome"
  nome: string;
  motor: MotorBilingue;
}

export const VOZES_BILINGUES: VozBilingue[] = [
  { id: 'kokoro:pm_alex', nome: 'Alex', motor: 'kokoro' },
  { id: 'kokoro:pm_santa', nome: 'Santa', motor: 'kokoro' },
  { id: 'supertonic:M1', nome: 'Voz M1', motor: 'supertonic' },
  { id: 'supertonic:M2', nome: 'Voz M2', motor: 'supertonic' },
  { id: 'supertonic:M3', nome: 'Voz M3', motor: 'supertonic' },
  { id: 'supertonic:M4', nome: 'Voz M4', motor: 'supertonic' },
  { id: 'supertonic:M5', nome: 'Voz M5', motor: 'supertonic' },
];

export const SOBRE_MOTOR: Record<MotorBilingue, { titulo: string; peso: string; texto: string }> = {
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

export const amostraBilingue = (id: string) => `${import.meta.env.BASE_URL}vozes/${id.replace(':', '-')}.mp3`;

type Resposta = { type: string; id: number; valor?: number | boolean; amostras?: Float32Array; taxa?: number; gasto?: number; mensagem?: string };

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
  await pedir({ type: 'baixar', voz: id }, progresso);
  baixadas.add(id);
}

export async function bilingueBaixada(id: string): Promise<boolean> {
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

/** Quantos segundos de fala cada motor gera por segundo neste aparelho (a última medida). */
export function desempenho(): Partial<Record<MotorBilingue, number>> {
  try { return JSON.parse(localStorage.getItem(KEY_DESEMPENHO) ?? '{}'); } catch { return {}; }
}

const KEY_SEM_PLACA = 'ingles-hibrido:vozes-sem-placa';
/** Sem resposta nesse tempo, a geração travou: a placa de vídeo de alguns aparelhos para sem dar erro. */
const LIMITE_MS = 120_000;

function lerSemPlaca(): boolean {
  try { return localStorage.getItem(KEY_SEM_PLACA) === '1'; } catch { return false; }
}

function destravar() {
  try {
    localStorage.setItem(KEY_SEM_PLACA, '1');
    localStorage.removeItem(KEY_DESEMPENHO); // as medidas com a placa não valem mais
  } catch { /* sem armazenamento */ }
  worker?.terminate();
  worker = undefined;
  pendentes.forEach((p) => p.falha(new Error('A geração da voz travou.')));
  pendentes.clear();
}

export async function sintetizarBilingue(
  id: string, partes: { texto: string; lingua: 'pt' | 'en' }[], velocidade: number,
): Promise<{ amostras: Float32Array; taxa: number }> {
  const relogio = window.setTimeout(destravar, LIMITE_MS);
  const r = await pedir({ type: 'falar', voz: id, partes, velocidade, semPlaca: lerSemPlaca() })
    .finally(() => window.clearTimeout(relogio));
  const amostras = r.amostras!;
  const taxa = r.taxa!;
  try {
    // fica a melhor medida: a primeira fala de cada vez ainda está preparando a placa de vídeo
    const motor = id.split(':')[0] as MotorBilingue;
    const medidas = desempenho();
    medidas[motor] = Math.max(medidas[motor] ?? 0, amostras.length / taxa / r.gasto!);
    localStorage.setItem(KEY_DESEMPENHO, JSON.stringify(medidas));
  } catch { /* sem armazenamento */ }
  return { amostras, taxa };
}
