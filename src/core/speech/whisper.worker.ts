/// <reference lib="webworker" />
import { pipeline, env } from '@huggingface/transformers';

/**
 * Whisper rodando no navegador, em uma thread separada pra não travar a tela.
 * Modelo só em inglês: o jogo é de falar inglês, e o .en erra menos em palavra
 * curta que o multilíngue. Baixa uma vez e fica no cache do navegador.
 */
env.allowLocalModels = false;

const MODEL = 'Xenova/whisper-base.en';

type Msg =
  | { type: 'load' }
  | { type: 'transcribe'; id: number; samples: Float32Array };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any;
let loading: Promise<void> | undefined;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

function load(): Promise<void> {
  loading ??= (async () => {
    // 'gpu' existir não basta: muito celular tem a API mas nenhum adaptador, e o
    // onnxruntime que tentou WebGPU e falhou não volta para o wasm. Pergunta antes.
    let hasGpu = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = (navigator as any).gpu;
      hasGpu = !!(gpu && (await gpu.requestAdapter()));
    } catch {
      hasGpu = false;
    }
    const opts = (device: 'webgpu' | 'wasm') => ({
      device,
      dtype: device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.status === 'progress' && typeof p.progress === 'number') post({ type: 'progress', value: p.progress / 100 });
      },
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      asr = await (pipeline as any)('automatic-speech-recognition', MODEL, opts(hasGpu ? 'webgpu' : 'wasm'));
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      asr = await (pipeline as any)('automatic-speech-recognition', MODEL, opts('wasm'));
    }
    post({ type: 'ready' });
  })();
  loading.catch(() => { loading = undefined; });
  return loading;
}

/** Silêncio nas pontas: o Whisper se perde em áudio que começa e termina colado na fala. */
function pad(samples: Float32Array, rate = 16000, sec = 0.4): Float32Array {
  const n = Math.round(rate * sec);
  const out = new Float32Array(samples.length + 2 * n);
  out.set(samples, n);
  return out;
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'load') { await load(); return; }
    await load();
    const out = await asr(pad(m.samples), { return_timestamps: false, num_beams: 1 });
    const text = Array.isArray(out) ? out.map((o: { text: string }) => o.text).join(' ') : out.text;
    post({ type: 'result', id: m.id, text: String(text ?? '') });
  } catch (err) {
    post({ type: 'error', id: m.type === 'transcribe' ? m.id : -1, message: String((err as Error)?.message ?? err) });
  }
};
