/// <reference lib="webworker" />
/**
 * Vozes Piper rodando no navegador, numa thread separada pra não travar a tela.
 *
 * O modelo de cada voz (~60 MB) é baixado uma vez e guardado no Cache Storage;
 * depois fala sem internet. O texto vira fonemas pelo espeak-ng em WebAssembly e
 * os fonemas viram áudio pelo onnxruntime. A sessão fica na memória: carregar o
 * modelo a cada frase levaria segundos.
 */
import * as ort from 'onnxruntime-web';
import { createPiperPhonemize } from './phonemize.js';

const ORT_VERSAO = '1.31.0-dev.20260914-8d85527a0';
const MODELOS = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const FONEMAS = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const CACHE = 'eita-vozes-v1';

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSAO}/dist/`;
ort.env.wasm.numThreads = 1; // sem isolamento de origem (GitHub Pages), só uma thread

type Msg =
  | { type: 'baixar'; id: number; voz: string }
  | { type: 'baixada'; id: number; voz: string }
  | { type: 'remover'; id: number; voz: string }
  | { type: 'falar'; id: number; voz: string; texto: string; velocidade: number };

interface Config {
  espeak: { voice: string };
  audio: { sample_rate: number };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  speaker_id_map?: Record<string, number>;
}

const post = (m: unknown, t?: Transferable[]) => (self as unknown as Worker).postMessage(m, t ?? []);

/** pt_BR-faber-medium -> pt/pt_BR/faber/medium/pt_BR-faber-medium */
function caminho(voz: string): string {
  const [local, nome, qualidade] = voz.split('-');
  return `${MODELOS}/${local.split('_')[0]}/${local}/${nome}/${qualidade}/${voz}`;
}

async function buscar(url: string, progresso?: (f: number) => void): Promise<Response> {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(url);
  if (guardada) return guardada;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Falha ao baixar a voz (${r.status}).`);
  const total = Number(r.headers.get('Content-Length') || 0);
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let lido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    lido += value.length;
    if (total && progresso) progresso(lido / total);
  }
  const resposta = new Response(new Blob(partes as BlobPart[]), { headers: { 'Content-Type': r.headers.get('Content-Type') ?? '' } });
  await cache.put(url, resposta.clone());
  return resposta;
}

const sessoes = new Map<string, Promise<{ sessao: ort.InferenceSession; config: Config }>>();

function carregar(voz: string, progresso?: (f: number) => void) {
  let s = sessoes.get(voz);
  if (!s) {
    s = (async () => {
      const config = (await (await buscar(`${caminho(voz)}.onnx.json`)).json()) as Config;
      const modelo = await (await buscar(`${caminho(voz)}.onnx`, progresso)).arrayBuffer();
      const sessao = await ort.InferenceSession.create(modelo);
      return { sessao, config };
    })();
    s.catch(() => sessoes.delete(voz));
    // no máximo uma voz por língua na memória: cada uma ocupa ~60 MB
    const lingua = voz.slice(0, 2);
    for (const outra of sessoes.keys()) if (outra !== voz && outra.slice(0, 2) === lingua) sessoes.delete(outra);
    sessoes.set(voz, s);
  }
  return s;
}

// O conversor leva ~1 s para subir: fica um só, reaproveitado entre as falas. Se ele
// quebrar (o espeak às vezes não aceita ser chamado de novo), sobe outro.
let saida: number[][] = [];
let conversor: Promise<{ callMain: (a: string[]) => void }> | undefined;

function iniciarConversor() {
  conversor ??= createPiperPhonemize({
    print: (linha: string) => { saida.push(JSON.parse(linha).phoneme_ids as number[]); },
    printErr: () => { /* avisos do espeak */ },
    locateFile: (f: string) => (f.endsWith('.wasm') ? `${FONEMAS}.wasm` : f.endsWith('.data') ? `${FONEMAS}.data` : f),
  });
  return conversor;
}

async function fonemas(texto: string, lingua: string): Promise<number[]> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const m = await iniciarConversor();
    saida = [];
    try {
      m.callMain(['-l', lingua, '--input', JSON.stringify([{ text: texto }]), '--espeak_data', '/espeak-ng-data']);
    } catch {
      /* uma saída do programa também cai aqui; o que importa é o que foi impresso */
    }
    // o espeak devolve uma linha por frase: junta todas
    if (saida.length) return saida.flat();
    conversor = undefined;
  }
  throw new Error('Não consegui converter o texto em fala.');
}
async function falar(voz: string, texto: string, velocidade: number) {
  const { sessao, config } = await carregar(voz);
  const ids = await fonemas(texto.trim(), config.espeak.voice);
  const { noise_scale, length_scale, noise_w } = config.inference;
  // velocidade pelo próprio modelo (duração dos fonemas), sem esticar o áudio: não muda o tom
  const entradas: Record<string, ort.Tensor> = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([noise_scale, length_scale / velocidade, noise_w]), [3]),
  };
  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) {
    entradas.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  }
  const saida = await sessao.run(entradas);
  const audio = (saida.output ?? Object.values(saida)[0]).data as Float32Array;
  return { amostras: new Float32Array(audio), taxa: config.audio.sample_rate };
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'baixar') {
      await carregar(m.voz, (f) => post({ type: 'progresso', id: m.id, valor: f }));
      post({ type: 'pronto', id: m.id });
    } else if (m.type === 'baixada') {
      const cache = await caches.open(CACHE);
      post({ type: 'pronto', id: m.id, valor: !!(await cache.match(`${caminho(m.voz)}.onnx`)) });
    } else if (m.type === 'remover') {
      const cache = await caches.open(CACHE);
      await cache.delete(`${caminho(m.voz)}.onnx`);
      await cache.delete(`${caminho(m.voz)}.onnx.json`);
      sessoes.delete(m.voz);
      post({ type: 'pronto', id: m.id });
    } else if (m.type === 'falar') {
      const { amostras, taxa } = await falar(m.voz, m.texto, m.velocidade);
      post({ type: 'pronto', id: m.id, amostras, taxa }, [amostras.buffer]);
    }
  } catch (err) {
    post({ type: 'erro', id: m.id, mensagem: String((err as Error)?.message ?? err) });
  }
};