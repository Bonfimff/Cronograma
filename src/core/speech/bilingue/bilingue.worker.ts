/// <reference lib="webworker" />
/**
 * Vozes bilíngues: uma só voz lê português e inglês, sem emendar dois áudios.
 *
 * Dois motores, à escolha da pessoa:
 * - Kokoro (~92 MB): o texto vira fonemas pelo espeak-ng, cada pedaço nas regras da sua
 *   língua, e a frase inteira vai de uma vez para o modelo. O inglês sai com os sons do inglês.
 * - Supertonic (~398 MB): lê o texto direto. Marcar a língua no meio da frase sai
 *   incompreensível (testado em 02/11), então a frase mista vai inteira como português.
 *
 * Só um motor fica na memória: juntos, passariam de 500 MB no celular.
 */
import * as ort from 'onnxruntime-web/webgpu';
import { abrirCache, buscar } from '../piper/cache';
import { createPiperPhonemize } from '../piper/phonemize.js';

const ORT_VERSAO = '1.31.0-dev.20260914-8d85527a0';
const FONEMAS = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const KOKORO = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const SUPERTONIC = 'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46';

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSAO}/dist/`;
ort.env.wasm.numThreads = 1; // sem isolamento de origem (GitHub Pages), só uma thread

type Lingua = 'pt' | 'en';
interface Parte { texto: string; lingua: Lingua }
type Msg =
  | { type: 'baixar'; id: number; voz: string }
  | { type: 'baixada'; id: number; voz: string }
  | { type: 'remover'; id: number; voz: string }
  | { type: 'preparar'; id: number; voz: string; semPlaca?: boolean }
  | { type: 'falar'; id: number; voz: string; partes: Parte[]; velocidade: number; semPlaca?: boolean };

const post = (m: unknown, t?: Transferable[]) => (self as unknown as Worker).postMessage(m, t ?? []);
const separar = (voz: string) => voz.split(':') as ['kokoro' | 'supertonic', string];

/** Os arquivos de cada voz, com o tamanho em MB para a barra de progresso. */
function arquivos(voz: string): { url: string; mb: number }[] {
  const [motor, nome] = separar(voz);
  if (motor === 'kokoro') {
    return [
      { url: `${KOKORO}/onnx/model_quantized.onnx`, mb: 92.4 },
      { url: `${KOKORO}/tokenizer.json`, mb: 0.01 },
      { url: `${KOKORO}/voices/${nome}.bin`, mb: 0.5 },
    ];
  }
  return [
    { url: `${SUPERTONIC}/onnx/duration_predictor.onnx`, mb: 3.7 },
    { url: `${SUPERTONIC}/onnx/text_encoder.onnx`, mb: 36.4 },
    { url: `${SUPERTONIC}/onnx/vector_estimator.onnx`, mb: 256.5 },
    { url: `${SUPERTONIC}/onnx/vocoder.onnx`, mb: 101.4 },
    { url: `${SUPERTONIC}/onnx/tts.json`, mb: 0.01 },
    { url: `${SUPERTONIC}/onnx/unicode_indexer.json`, mb: 0.3 },
    { url: `${SUPERTONIC}/voice_styles/${nome}.json`, mb: 0.3 },
  ];
}

async function baixar(voz: string, progresso?: (f: number) => void): Promise<void> {
  const lista = arquivos(voz);
  const total = lista.reduce((s, a) => s + a.mb, 0);
  let feito = 0;
  for (const a of lista) {
    await buscar(a.url, (f) => progresso?.((feito + f * a.mb) / total));
    feito += a.mb;
  }
}

async function estaBaixada(voz: string): Promise<boolean> {
  const cache = await abrirCache();
  for (const a of arquivos(voz)) if (!(await cache.match(a.url))) return false;
  return true;
}

let usarPlaca = true;
let modo: 'placa' | 'processador' = 'processador';
let motivo = '';
let adaptador: Promise<boolean> | undefined;

/** Ter `navigator.gpu` não basta: muitos celulares não entregam um adaptador. */
function temAdaptador(): Promise<boolean> {
  adaptador ??= 'gpu' in navigator
    ? (navigator as unknown as { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter().then((a) => !!a).catch(() => false)
    : Promise.resolve(false);
  return adaptador;
}

/** Com a placa de vídeo do aparelho é bem mais rápido; sem ela, cai na thread única do processador. */
async function criar(url: string): Promise<ort.InferenceSession> {
  const modelo = await (await buscar(url)).arrayBuffer();
  if (!usarPlaca) motivo = 'desligada depois de uma falha';
  else if (!(await temAdaptador())) motivo = 'este navegador não oferece WebGPU';
  else {
    try {
      const sessao = await ort.InferenceSession.create(modelo, { executionProviders: ['webgpu'] });
      modo = 'placa';
      motivo = '';
      return sessao;
    } catch (e) {
      motivo = `o modelo não abriu na placa: ${String((e as Error)?.message ?? e).slice(0, 80)}`;
    }
  }
  modo = 'processador';
  return ort.InferenceSession.create(modelo, { executionProviders: ['wasm'] });
}
const json = async <T>(url: string) => (await (await buscar(url)).json()) as T;

// ---------- fonemas (só o Kokoro usa)
let saida: string[] = [];
let conversor: Promise<{ callMain: (a: string[]) => void }> | undefined;

function iniciarConversor() {
  conversor ??= createPiperPhonemize({
    print: (linha: string) => { saida.push((JSON.parse(linha).phonemes as string[]).join('')); },
    printErr: () => { /* avisos do espeak */ },
    locateFile: (f: string) => (f.endsWith('.wasm') ? `${FONEMAS}.wasm` : f.endsWith('.data') ? `${FONEMAS}.data` : f),
  });
  return conversor;
}

async function ipa(texto: string, lingua: string): Promise<string> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const m = await iniciarConversor();
    saida = [];
    try {
      m.callMain(['-l', lingua, '--input', JSON.stringify([{ text: texto }]), '--espeak_data', '/espeak-ng-data']);
    } catch {
      /* uma saída do programa também cai aqui; o que importa é o que foi impresso */
    }
    if (saida.length) return saida.join(' ');
    conversor = undefined;
  }
  throw new Error('Não consegui converter o texto em fala.');
}

/** O Kokoro aprendeu um alfabeto próprio: mesmas trocas que o misaki, o conversor oficial dele. */
const TROCAS_EN: [string, string][] = [
  ['aɪ', 'I'], ['aʊ', 'W'], ['dʒ', 'ʤ'], ['eɪ', 'A'], ['tʃ', 'ʧ'], ['ɔɪ', 'Y'], ['oʊ', 'O'],
  ['ʲ', ''], ['ɚ', 'əɹ'], ['r', 'ɹ'], ['x', 'k'], ['ç', 'k'], ['ɐ', 'ə'], ['ɬ', 'l'], ['̃', ''],
  ['ɜːɹ', 'ɜɹ'], ['ɜː', 'ɜɹ'], ['ɪə', 'iə'], ['ː', ''], ['e', 'A'], ['o', 'ɔ'], ['ɾ', 'T'], ['ʔ', 't'],
];
const TROCAS_PT: [string, string][] = [
  ['aɪ', 'I'], ['aʊ', 'W'], ['dz', 'ʣ'], ['dʒ', 'ʤ'], ['eɪ', 'A'], ['oʊ', 'O'], ['əʊ', 'Q'],
  ['ts', 'ʦ'], ['tʃ', 'ʧ'], ['ɔɪ', 'Y'], ['-', ''],
];

function paraKokoro(fonemas: string, lingua: Lingua): string {
  return (lingua === 'en' ? TROCAS_EN : TROCAS_PT).reduce((f, [a, b]) => f.split(a).join(b), fonemas);
}

// ---------- os dois motores
type Motor = { nome: string; gerar: (p: Parte[], velocidade: number) => Promise<{ amostras: Float32Array; taxa: number }> };

async function kokoro(voz: string): Promise<Motor> {
  const [, nome] = separar(voz);
  const [m0, m1, m2] = arquivos(voz);
  const sessao = await criar(m0.url);
  const vocab = (await json<{ model: { vocab: Record<string, number> } }>(m1.url)).model.vocab;
  const estilos = new Float32Array(await (await buscar(m2.url)).arrayBuffer());
  return {
    nome,
    async gerar(partes, velocidade) {
      const pedacos: string[] = [];
      for (const p of partes) {
        const t = p.texto.trim();
        if (!t) continue;
        // pontuação solta entre palavras marcadas: o espeak devolveria vazio, e a pausa se perderia
        pedacos.push(/\p{L}/u.test(t) ? paraKokoro(await ipa(t, p.lingua === 'en' ? 'en-us' : 'pt-br'), p.lingua) : t);
      }
      const fonemas = pedacos.join(' ').replace(/\s+([!?.,;:])/g, '$1');
      const ids = [...fonemas].flatMap((c) => (c in vocab ? [vocab[c]] : [])).slice(0, 508);
      const estilo = estilos.slice(ids.length * 256, (ids.length + 1) * 256);
      const r = await sessao.run({
        input_ids: new ort.Tensor('int64', BigInt64Array.from([0, ...ids, 0].map(BigInt)), [1, ids.length + 2]),
        style: new ort.Tensor('float32', estilo, [1, 256]),
        speed: new ort.Tensor('float32', Float32Array.from([velocidade]), [1]),
      });
      return { amostras: new Float32Array(r.waveform.data as Float32Array), taxa: 24000 };
    },
  };
}

interface EstiloSuper { style_ttl: { data: unknown; dims: number[] }; style_dp: { data: unknown; dims: number[] } }
interface ConfigSuper { ae: { sample_rate: number; base_chunk_size: number }; ttl: { chunk_compress_factor: number; latent_dim: number } }

const tensorDe = ({ data, dims }: { data: unknown; dims: number[] }) => new ort.Tensor('float32', Float32Array.from((data as number[]).flat(Infinity as 1) as number[]), dims);

/** Mesma limpeza do exemplo oficial, sem o que nunca aparece na conversa. */
function limparSuper(texto: string, lingua: Lingua): string {
  let t = texto.normalize('NFKD')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/[–‑—]/g, '-').replace(/[_[\]|/#→←]/g, ' ')
    .replace(/[“”]/g, '"').replace(/[‘’´`]/g, "'")
    .replace(/ ([,.!?;:'])/g, '$1').replace(/\s+/g, ' ').trim();
  if (!/[.!?;:,'")\]}…]$/.test(t)) t += '.';
  return `<${lingua}>${t}</${lingua}>`;
}

async function supertonic(voz: string): Promise<Motor> {
  const [, nome] = separar(voz);
  const lista = arquivos(voz);
  // um de cada vez: quatro sessões subindo juntas travam a inicialização da placa de vídeo
  const dp = await criar(lista[0].url);
  const te = await criar(lista[1].url);
  const ve = await criar(lista[2].url);
  const vo = await criar(lista[3].url);
  const cfg = await json<ConfigSuper>(lista[4].url);
  const indice = await json<number[]>(lista[5].url);
  const estilo = await json<EstiloSuper>(lista[6].url);
  const ttl = tensorDe(estilo.style_ttl);
  const durEstilo = tensorDe(estilo.style_dp);
  const taxa = cfg.ae.sample_rate;
  const tamanho = cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor;
  const canais = cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor;

  return {
    nome,
    async gerar(partes, velocidade) {
      const lingua: Lingua = partes.every((p) => p.lingua === 'en') ? 'en' : 'pt';
      const texto = limparSuper(partes.map((p) => p.texto).join(''), lingua);
      const codigos = [...texto].map((c) => indice[c.codePointAt(0)!]).filter((v) => v !== undefined && v >= 0);
      const n = codigos.length;
      const ids = new ort.Tensor('int64', BigInt64Array.from(codigos.map(BigInt)), [1, n]);
      const mascara = new ort.Tensor('float32', new Float32Array(n).fill(1), [1, 1, n]);

      const d = await dp.run({ text_ids: ids, style_dp: durEstilo, text_mask: mascara });
      const segundos = Number((d.duration.data as Float32Array)[0]) / (1.05 * velocidade);
      const emb = await te.run({ text_ids: ids, style_ttl: ttl, text_mask: mascara });
      const t = Math.max(1, Math.floor((Math.floor(segundos * taxa) + tamanho - 1) / tamanho));

      const ruido = new Float32Array(canais * t);
      for (let i = 0; i < ruido.length; i++) {
        ruido[i] = Math.sqrt(-2 * Math.log(Math.max(1e-10, Math.random()))) * Math.cos(2 * Math.PI * Math.random());
      }
      let latente = new ort.Tensor('float32', ruido, [1, canais, t]);
      const mascaraL = new ort.Tensor('float32', new Float32Array(t).fill(1), [1, 1, t]);
      const PASSOS = 5;
      for (let p = 0; p < PASSOS; p++) {
        const r = await ve.run({
          noisy_latent: latente, text_emb: emb.text_emb, style_ttl: ttl, text_mask: mascara, latent_mask: mascaraL,
          total_step: new ort.Tensor('float32', Float32Array.from([PASSOS]), [1]),
          current_step: new ort.Tensor('float32', Float32Array.from([p]), [1]),
        });
        latente = new ort.Tensor('float32', r.denoised_latent.data as Float32Array, [1, canais, t]);
      }
      const som = await vo.run({ latent: latente });
      return { amostras: new Float32Array(som.wav_tts.data as Float32Array), taxa };
    },
  };
}

let carregado: { voz: string; motor: Promise<Motor>; carga: number } | undefined;

function motorDe(voz: string): Promise<Motor> {
  if (carregado?.voz === voz) return carregado.motor;
  const t0 = performance.now();
  const motor = separar(voz)[0] === 'kokoro' ? kokoro(voz) : supertonic(voz);
  const atual = { voz, motor, carga: 0 };
  motor.then(() => { atual.carga = (performance.now() - t0) / 1000; }, () => { if (carregado === atual) carregado = undefined; });
  carregado = atual;
  return motor;
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'baixar') {
      await baixar(m.voz, (f) => post({ type: 'progresso', id: m.id, valor: f }));
      post({ type: 'pronto', id: m.id });
    } else if (m.type === 'baixada') {
      post({ type: 'pronto', id: m.id, valor: await estaBaixada(m.voz) });
    } else if (m.type === 'remover') {
      const cache = await abrirCache();
      if (carregado?.voz.split(':')[0] === m.voz.split(':')[0]) carregado = undefined;
      for (const a of arquivos(m.voz)) await cache.delete(a.url);
      post({ type: 'pronto', id: m.id });
    } else if (m.type === 'preparar') {
      if (m.semPlaca) usarPlaca = false;
      await motorDe(m.voz);
      post({ type: 'pronto', id: m.id, modo, motivo, carga: carregado?.carga });
    } else {
      if (m.semPlaca) usarPlaca = false;
      let t0 = performance.now();
      let audio: { amostras: Float32Array; taxa: number };
      try {
        audio = await (await motorDe(m.voz)).gerar(m.partes, m.velocidade);
      } catch (erro) {
        if (!usarPlaca) throw erro;
        // a placa falhou no meio (memória, driver): tenta de novo só no processador
        usarPlaca = false;
        carregado = undefined;
        const motor = await motorDe(m.voz);
        t0 = performance.now();
        audio = await motor.gerar(m.partes, m.velocidade);
      }
      const { amostras, taxa } = audio;
      const gasto = (performance.now() - t0) / 1000;
      post({ type: 'pronto', id: m.id, amostras, taxa, gasto, modo, motivo, carga: carregado?.carga }, [amostras.buffer]);
    }
  } catch (err) {
    post({ type: 'erro', id: m.id, mensagem: String((err as Error)?.message ?? err) });
  }
};
