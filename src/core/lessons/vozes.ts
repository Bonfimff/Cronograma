/**
 * Vozes e ritmo da leitura, escolhidos pelo usuário.
 *
 * O navegador oferece uma lista de vozes que muda de aparelho para aparelho, e
 * a qualidade varia muito: as mais naturais costumam ser as marcadas como
 * "Natural", "Neural" ou "Online", e as piores são as sintetizadas localmente
 * pelo eSpeak. Aqui a lista é ordenada por essa pista e a escolha fica no
 * aparelho, porque uma voz que existe num telefone pode não existir em outro.
 */

import { baixarVoz, PREFIXO_NATURAL, sintetizar, vozBaixada } from '../speech/piper';

export type Lingua = 'en' | 'pt';

export interface AjustesVoz {
  /** Voz escolhida: "natural:<id>" (Piper, no navegador), o nome de uma voz do aparelho, ou vazio = a do sistema. */
  voz: Record<Lingua, string>;
  /** 0,5x a 1,5x, por língua. */
  velocidade: Record<Lingua, number>;
}

export const AJUSTES_PADRAO: AjustesVoz = {
  voz: { en: '', pt: '' },
  velocidade: { en: 0.9, pt: 1 },
};

const KEY = 'ingles-hibrido:vozes';
const PREFIXO: Record<Lingua, string> = { en: 'en', pt: 'pt' };

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();

function ler(): AjustesVoz {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return AJUSTES_PADRAO;
    const v = JSON.parse(raw) as Partial<AjustesVoz>;
    return {
      voz: { ...AJUSTES_PADRAO.voz, ...(v.voz ?? {}) },
      velocidade: { ...AJUSTES_PADRAO.velocidade, ...(v.velocidade ?? {}) },
    };
  } catch {
    return AJUSTES_PADRAO;
  }
}

let atual = ler();

export const ajustesVoz = {
  get: () => atual,
  guardar(novo: AjustesVoz) {
    atual = novo;
    try { localStorage.setItem(KEY, JSON.stringify(novo)); } catch { /* sem armazenamento */ }
    ouvintes.forEach((o) => o());
  },
  subscribe(o: Ouvinte) {
    ouvintes.add(o);
    return () => { ouvintes.delete(o); };
  },
};

/** Quanto mais alto, mais natural a voz costuma ser. */
function nota(v: SpeechSynthesisVoice): number {
  const nome = v.name.toLowerCase();
  let n = 0;
  if (/natural|neural/.test(nome)) n += 6;
  if (/online|cloud|premium|enhanced|aprimorad/.test(nome)) n += 4;
  if (/google/.test(nome)) n += 3;
  if (/microsoft/.test(nome)) n += 2;
  if (/espeak|compact|pico/.test(nome)) n -= 6;
  if (v.localService) n -= 1; // quase sempre a voz robótica do sistema
  return n;
}

/** Vozes daquela língua, das mais naturais para as mais duras. */
export function vozesDe(lingua: Lingua): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(PREFIXO[lingua]))
    .sort((a, b) => nota(b) - nota(a) || a.name.localeCompare(b.name));
}

/** A voz escolhida, ou a mais natural que o aparelho tiver. */
export function vozDe(lingua: Lingua): SpeechSynthesisVoice | undefined {
  const lista = vozesDe(lingua);
  const escolhida = atual.voz[lingua];
  return lista.find((v) => v.name === escolhida) ?? lista[0];
}

/** Prepara a fala com a voz e o ritmo escolhidos para aquela língua. */
export function prepararFala(texto: string, lingua: Lingua, fator = 1): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(texto);
  const voz = vozDe(lingua);
  if (voz) {
    u.voice = voz;
    u.lang = voz.lang;
  } else {
    u.lang = lingua === 'en' ? 'en-US' : 'pt-BR';
  }
  u.rate = Math.max(0.5, Math.min(2, atual.velocidade[lingua] * fator));
  return u;
}

export interface Parte {
  texto: string;
  lingua: Lingua;
}

let geracao = 0; // cada fala nova invalida as anteriores
let fonte: AudioBufferSourceNode | undefined;
let contexto: AudioContext | undefined;

const esperar = (ms: number) => new Promise<void>((ok) => window.setTimeout(ok, ms));

/** A voz natural escolhida para a língua, se houver. */
export function vozNatural(lingua: Lingua): string | undefined {
  const v = atual.voz[lingua];
  return v.startsWith(PREFIXO_NATURAL) ? v.slice(PREFIXO_NATURAL.length) : undefined;
}

/** Interrompe qualquer fala, natural ou do aparelho. */
export function pararFala(): void {
  geracao++;
  try { fonte?.stop(); } catch { /* já tinha parado */ }
  fonte = undefined;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

function tocarAmostras(amostras: Float32Array, taxa: number, minha: number): Promise<void> {
  const ctx = (contexto ??= new AudioContext());
  // um respiro de silêncio antes: alguns aparelhos (e o Bluetooth) engolem o começo do som
  const folga = Math.round(taxa * 0.12);
  const buffer = ctx.createBuffer(1, amostras.length + folga, taxa);
  buffer.getChannelData(0).set(amostras, folga);
  return new Promise((ok) => {
    if (minha !== geracao) { ok(); return; }
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(ctx.destination);
    // se o navegador segurar o áudio (aba em segundo plano, sem toque), a leitura não fica parada para sempre
    const reserva = window.setTimeout(ok, (buffer.duration + 2) * 1000);
    s.onended = () => { window.clearTimeout(reserva); if (fonte === s) fonte = undefined; ok(); };
    fonte = s;
    s.start();
  });
}

function falarNoAparelho(p: Parte, fator: number, minha: number): Promise<void> {
  return new Promise((ok) => {
    if (typeof speechSynthesis === 'undefined' || minha !== geracao) { ok(); return; }
    const u = prepararFala(p.texto, p.lingua, fator);
    u.onend = () => ok();
    u.onerror = () => ok();
    speechSynthesis.speak(u);
  });
}

/**
 * Fala uma ou mais partes, na ordem, cada uma na voz da sua língua. Usa a voz natural
 * escolhida quando ela já está baixada; senão, a do aparelho. Termina quando acaba de
 * falar ou quando outra fala começa.
 */
export async function falar(partes: Parte | Parte[], fator = 1): Promise<void> {
  const lista = (Array.isArray(partes) ? partes : [partes]).filter((p) => p.texto.trim());
  const ocupado = !!fonte || (typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending));
  pararFala();
  const minha = geracao;
  if (!lista.length) return;
  if (lista.some((p) => vozNatural(p.lingua))) {
    // criado e acordado aqui, ainda dentro do toque: o iPhone não deixa tocar som de outro jeito
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') void contexto.resume();
  }
  // falar logo depois de cancelar corta a primeira sílaba no Chrome do Android
  if (ocupado) await esperar(150);

  const gerar = (p: Parte) => {
    const id = vozNatural(p.lingua);
    if (!id) return Promise.resolve(null);
    const vel = Math.max(0.5, Math.min(2, atual.velocidade[p.lingua] * fator));
    return vozBaixada(id)
      .then((ok) => (ok ? sintetizar(id, p.texto, vel) : null))
      .catch(() => null);
  };

  // enquanto uma parte toca, a seguinte já está sendo gerada
  let seguinte = gerar(lista[0]);
  for (let i = 0; i < lista.length; i++) {
    if (minha !== geracao) return;
    const esta = seguinte;
    seguinte = i + 1 < lista.length ? gerar(lista[i + 1]) : Promise.resolve(null);
    const audio = await esta;
    if (minha !== geracao) return;
    if (audio) await tocarAmostras(audio.amostras, audio.taxa, minha);
    else await falarNoAparelho(lista[i], fator, minha);
  }
}
// Carregar o modelo na memória leva alguns segundos: com o app aberto e parado, já
// deixa pronta a voz natural escolhida, para a primeira fala não esperar.
if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    for (const lingua of ['en', 'pt'] as Lingua[]) {
      const id = vozNatural(lingua);
      if (id) void vozBaixada(id).then((ok) => (ok ? baixarVoz(id) : undefined)).catch(() => undefined);
    }
  }, 4000);
}