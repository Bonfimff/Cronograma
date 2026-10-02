/**
 * Microfone do jogo de fala: abre uma vez, fica aberto, e separa voz de ruído.
 *
 * O erro de "errou antes de falar" nasce de tratar "não ouvi nada" como erro.
 * Aqui o microfone só entrega duas coisas bem distintas: `silence` (ninguém
 * falou no tempo dado) ou `speech` (um trecho de áudio com voz, do começo ao
 * fim). Quem decide se a palavra está certa é o jogo, depois.
 *
 * Detecção de voz por energia, calibrada no ruído do ambiente: ventilador,
 * trânsito e TV baixa elevam o limite em vez de virar "fala".
 */

export const SAMPLE_RATE = 16000;

export type Heard =
  | { kind: 'silence' }
  | { kind: 'speech'; samples: Float32Array }
  | { kind: 'cancelled' };

export interface ListenOptions {
  /** ms esperando a voz começar; depois que começa, o tempo deixa de contar */
  waitMs: number;
  /** nível do microfone (0 a 1), pra animar a tela */
  onLevel?: (level: number) => void;
  /** a voz começou */
  onStart?: () => void;
  /** duração máxima da fala (ms); frases inteiras precisam de mais que uma palavra */
  maxMs?: number;
}

const FRAME_MS = 30;
const PREROLL_MS = 300;
const START_FRAMES = 3; // ~90 ms seguidos acima do limite
const END_SILENCE_MS = 550;
const MIN_SPEECH_MS = 120;
const MAX_SPEECH_MS = 4000;
const MIN_THRESHOLD = 0.012;

/** Worklet inline: devolve os blocos de áudio crus pra thread principal. */
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('tap', Tap);
`;

const rms = (b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return Math.sqrt(s / (b.length || 1));
};

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const a = Math.floor(pos);
    const f = pos - a;
    out[i] = input[a] * (1 - f) + (input[Math.min(a + 1, input.length - 1)] ?? 0) * f;
  }
  return out;
}

export class Mic {
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private url?: string;
  private rate = 48000;
  private threshold = 0.03;
  private onBlock?: (b: Float32Array) => void;

  get isOpen(): boolean { return !!this.stream; }

  /** Pede o microfone (com cancelamento de ruído do navegador) e liga o tap de áudio. */
  async open(): Promise<void> {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não tem acesso ao microfone (precisa de HTTPS).');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true, channelCount: 1 },
    });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.rate = this.ctx.sampleRate;
    await this.ctx.resume();
    this.url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(this.url);
    this.node = new AudioWorkletNode(this.ctx, 'tap');
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onBlock?.(e.data);
    const src = this.ctx.createMediaStreamSource(this.stream);
    src.connect(this.node);
    // sem ligar ao destino o navegador pode parar de puxar o áudio; o ganho zero evita eco
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
  }

  /**
   * Mede o ruído do ambiente. Deve ser feito com a pessoa quieta, antes do
   * primeiro desafio. Define o limite acima do qual algo conta como voz.
   */
  async calibrate(ms = 1200): Promise<void> {
    const levels: number[] = [];
    await new Promise<void>((done) => {
      const t0 = performance.now();
      let frame: number[] = [];
      const per = Math.round((this.rate * FRAME_MS) / 1000);
      this.onBlock = (b) => {
        frame.push(...b);
        while (frame.length >= per) {
          levels.push(rms(Float32Array.from(frame.slice(0, per))));
          frame = frame.slice(per);
        }
        if (performance.now() - t0 >= ms) { this.onBlock = undefined; done(); }
      };
    });
    levels.sort((a, b) => a - b);
    // o percentil 90 ignora um estalo isolado durante a medição
    const floor = levels[Math.floor(levels.length * 0.9)] ?? 0;
    this.threshold = Math.max(MIN_THRESHOLD, floor * 3);
  }

  /** Espera a pessoa falar e devolve o trecho com a voz. */
  listen(opts: ListenOptions): { result: Promise<Heard>; cancel: () => void } {
    const per = Math.round((this.rate * FRAME_MS) / 1000);
    const preFrames = Math.ceil(PREROLL_MS / FRAME_MS);
    const endFrames = Math.ceil(END_SILENCE_MS / FRAME_MS);
    const maxFrames = Math.ceil((opts.maxMs ?? MAX_SPEECH_MS) / FRAME_MS);
    const low = this.threshold * 0.6; // histerese: pra continuar "falando" basta menos que pra começar

    let cancel = () => {};
    const result = new Promise<Heard>((resolve) => {
      let buf: number[] = [];
      const ring: Float32Array[] = [];
      const voice: Float32Array[] = [];
      let above = 0;
      let quiet = 0;
      let speaking = false;
      let voicedFrames = 0;
      const t0 = performance.now();
      let finished = false;

      const finish = (h: Heard) => {
        if (finished) return;
        finished = true;
        this.onBlock = undefined;
        resolve(h);
      };
      cancel = () => finish({ kind: 'cancelled' });

      this.onBlock = (block) => {
        buf.push(...block);
        while (buf.length >= per && !finished) {
          const fr = Float32Array.from(buf.slice(0, per));
          buf = buf.slice(per);
          const lvl = rms(fr);
          opts.onLevel?.(Math.min(1, lvl / (this.threshold * 4)));
          if (!speaking) {
            ring.push(fr);
            if (ring.length > preFrames) ring.shift();
            above = lvl > this.threshold ? above + 1 : 0;
            if (above >= START_FRAMES) {
              speaking = true;
              voice.push(...ring); // começo da palavra, antes de o limite ser cruzado
              voicedFrames = above;
              opts.onStart?.();
            } else if (performance.now() - t0 > opts.waitMs) {
              finish({ kind: 'silence' });
            }
          } else {
            voice.push(fr);
            if (lvl > low) { quiet = 0; voicedFrames++; } else quiet++;
            if (quiet >= endFrames || voice.length >= maxFrames + preFrames) {
              if (voicedFrames * FRAME_MS < MIN_SPEECH_MS) {
                // estalo curto, não é fala: volta a esperar
                speaking = false; above = 0; quiet = 0; voice.length = 0; ring.length = 0;
                continue;
              }
              const all = new Float32Array(voice.length * per);
              voice.forEach((v, i) => all.set(v, i * per));
              finish({ kind: 'speech', samples: resample(all, this.rate, SAMPLE_RATE) });
            }
          }
        }
      };
    });
    return { result, cancel };
  }

  close(): void {
    this.onBlock = undefined;
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    if (this.url) URL.revokeObjectURL(this.url);
    this.stream = undefined;
    this.ctx = undefined;
    this.node = undefined;
  }
}
