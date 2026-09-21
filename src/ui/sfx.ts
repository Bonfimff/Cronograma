/**
 * Efeitos sonoros sintetizados na hora (Web Audio) — nada de arquivo de áudio.
 * O navegador só libera som depois de um toque do usuário: chame `primeAudio()`
 * dentro do toque e toque o efeito depois, quando quiser.
 */

let ctx: AudioContext | null = null;

export function primeAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* sem áudio: o jogo segue mudo */ }
}

/** Estalo de chicote: um estouro de ruído agudo que morre muito rápido. */
export function playCrack(): void {
  if (!ctx) return;
  try {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 0.22);
    const buf = ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // pico seco nos primeiros milissegundos, depois cauda curta
      const env = i < rate * 0.004 ? 1 : (1 - t) ** 7;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(hp).connect(gain).connect(ctx.destination);
    src.start();
  } catch { /* ignora */ }
}
