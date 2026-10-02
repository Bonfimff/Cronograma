/**
 * Ponte entre o jogo e o Whisper (que mora num Worker).
 * `prepare` baixa e carrega o modelo uma vez; `transcribe` devolve o texto de um trecho de áudio.
 */

let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let nextId = 1;
let loadFail: ((e: Error) => void) | undefined;
const pending = new Map<number, { ok: (t: string) => void; fail: (e: Error) => void }>();
const progressListeners = new Set<(v: number) => void>();

type FromWorker = { type: string; id?: number; text?: string; value?: number; message?: string };

function start(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'progress') progressListeners.forEach((f) => f(m.value ?? 0));
    else if (m.type === 'result') { pending.get(m.id!)?.ok(m.text ?? ''); pending.delete(m.id!); }
    else if (m.type === 'error') {
      const err = new Error(m.message);
      if (m.id === -1) { loadFail?.(err); loadFail = undefined; }
      else { pending.get(m.id!)?.fail(err); pending.delete(m.id!); }
    }
  };
  return worker;
}

/** Baixa e prepara o modelo. Chamar de novo reaproveita o que já carregou. */
export function prepare(onProgress?: (fraction: number) => void): Promise<void> {
  if (onProgress) progressListeners.add(onProgress);
  ready ??= new Promise<void>((ok, fail) => {
    const w = start();
    loadFail = (e) => { ready = undefined; fail(e); };
    const done = (e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'ready') { w.removeEventListener('message', done); loadFail = undefined; ok(); }
    };
    w.addEventListener('message', done);
    w.postMessage({ type: 'load' });
  });
  return ready.finally(() => { if (onProgress) progressListeners.delete(onProgress); });
}

export async function transcribe(samples: Float32Array): Promise<string> {
  await prepare();
  const id = nextId++;
  return new Promise<string>((ok, fail) => {
    pending.set(id, { ok, fail });
    start().postMessage({ type: 'transcribe', id, samples }, [samples.buffer]);
  });
}
