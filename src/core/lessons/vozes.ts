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
  u.rate = Math.max(0.35, Math.min(2, atual.velocidade[lingua] * fator));
  return u;
}

export interface Parte {
  texto: string;
  lingua: Lingua;
}

let geracao = 0; // cada fala nova invalida as anteriores

// Qual fala está tocando agora (uma chave escolhida por quem pediu), para a tela animar o botão.
let chaveAtual: string | null = null;
const ouvintesFala = new Set<() => void>();
function marcarFala(chave: string | null) {
  if (chave === chaveAtual) return;
  chaveAtual = chave;
  ouvintesFala.forEach((o) => o());
}
export const falaAtual = {
  get: () => chaveAtual,
  subscribe(o: () => void) {
    ouvintesFala.add(o);
    return () => { ouvintesFala.delete(o); };
  },
};
/**
 * A palavra que está sendo dita agora: o texto da parte e o índice da palavra nele (contando
 * só as palavras, como as telas recortam o texto). A tela acende a palavra enquanto ela soa.
 *
 * A voz do aparelho avisa cada palavra (onboundary), quando o navegador manda; a voz natural
 * (Piper) não tem marcação de tempo, então a posição é estimada pelo tamanho de cada palavra
 * dentro da duração do áudio: fica bem perto, e nunca atrasa o som.
 */
export interface PalavraFalada { texto: string; indice: number }
let palavraAtual: PalavraFalada | null = null;
const ouvintesPalavra = new Set<() => void>();
function marcarPalavra(p: PalavraFalada | null) {
  if (p?.texto === palavraAtual?.texto && p?.indice === palavraAtual?.indice) return;
  palavraAtual = p;
  ouvintesPalavra.forEach((o) => o());
}
export const palavraFalada = {
  get: () => palavraAtual,
  subscribe(o: () => void) {
    ouvintesPalavra.add(o);
    return () => { ouvintesPalavra.delete(o); };
  },
};

const PALAVRA_RE = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g;
const palavrasDe = (texto: string) => [...texto.matchAll(PALAVRA_RE)].map((m) => ({ ini: m.index ?? 0, fim: (m.index ?? 0) + m[0].length }));
let relogios: number[] = [];
function pararRelogios() {
  relogios.forEach((r) => window.clearTimeout(r));
  relogios = [];
}

/** Agenda o acender de cada palavra, dividindo a duração pelo tamanho de cada uma. */
function estimarPalavras(texto: string, inicioMs: number, duracaoMs: number, minha: number, comPausas = false) {
  pararRelogios();
  const ps = palavrasDe(texto);
  if (!ps.length || duracaoMs <= 0) return;
  // +2: o respiro entre palavras; no lento, a vírgula entre elas vale uma pausa bem maior
  const pesos = ps.map((p, i) => p.fim - p.ini + (comPausas && i < ps.length - 1 ? 9 : 2));
  const total = pesos.reduce((a, b) => a + b, 0);
  let t = inicioMs;
  ps.forEach((_, i) => {
    relogios.push(window.setTimeout(() => { if (minha === geracao) marcarPalavra({ texto, indice: i }); }, t));
    t += (duracaoMs * pesos[i]) / total;
  });
}

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
  pararRelogios();
  marcarPalavra(null);
  marcarFala(null);
}

function tocarAmostras(amostras: Float32Array, taxa: number, minha: number, texto = '', comPausas = false): Promise<void> {
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
    // a voz natural começa e termina com um pouco de silêncio: tira ~0,12 s de cada ponta
    if (texto) estimarPalavras(texto, 120 + 120, Math.max(0, buffer.duration * 1000 - 120 - 240), minha, comPausas);
  });
}

/** Fator a partir do qual a fala é "lenta": as palavras ganham pausa entre elas. */
const LIMITE_LENTO = 0.8;
const palavraSolta = (texto: string) => palavrasDe(texto).length === 1;

/**
 * O texto que vai de fato para a voz. Testado com a voz natural e o Whisper (06/10):
 * - palavra solta: vai com ponto final e na velocidade normal; esticada ela sai deformada
 *   ("are" virava "okay"; "work", "what"), então no lento ela é repetida, não esticada;
 * - frase no lento: uma vírgula entre as palavras dá a pausa pedida, e cada palavra continua
 *   bem articulada ("Where, do, you, work?").
 */
export function textoParaFalar(texto: string, lingua: Lingua, fator: number): string {
  const t = texto.trim();
  if (lingua !== 'en') return t;
  if (palavraSolta(t)) return /[.!?]$/.test(t) ? t : `${t}.`;
  if (fator >= LIMITE_LENTO) return t;
  const final = /[.!?]$/.test(t) ? t.slice(-1) : '.';
  return t.replace(/[.!?]+$/, '').split(/\s*,?\s+/).filter(Boolean).join(', ') + final;
}

/** Palavra solta não é esticada (deforma): no lento ela toca na velocidade normal, duas vezes. */
const fatorReal = (p: Parte, fator: number) => (p.lingua === 'en' && palavraSolta(p.texto) ? Math.max(fator, 1) : fator);
const repeticoes = (p: Parte, fator: number) => (p.lingua === 'en' && palavraSolta(p.texto) && fator < LIMITE_LENTO ? 2 : 1);

function falarNoAparelho(p: Parte, fator: number, minha: number): Promise<void> {
  return new Promise((ok) => {
    if (typeof speechSynthesis === 'undefined' || minha !== geracao) { ok(); return; }
    const falado = textoParaFalar(p.texto, p.lingua, fator);
    const u = prepararFala(falado, p.lingua, fatorReal(p, fator));
    // as marcas do aparelho vêm em posições do texto falado (com as vírgulas do lento)
    const ps = palavrasDe(falado);
    let marcadoPeloAparelho = false;
    // estimativa até o aparelho mandar a primeira marca (alguns navegadores nunca mandam)
    u.onstart = () => {
      if (marcadoPeloAparelho) return;
      const letrasPorSegundo = 14 * u.rate;
      estimarPalavras(p.texto, 0, (p.texto.length / letrasPorSegundo) * 1000, minha);
    };
    u.onboundary = (e) => {
      if (e.name && e.name !== 'word') return;
      if (!marcadoPeloAparelho) { marcadoPeloAparelho = true; pararRelogios(); }
      const i = ps.findIndex((w) => e.charIndex < w.fim);
      if (i >= 0 && minha === geracao) marcarPalavra({ texto: p.texto, indice: i });
    };
    u.onend = () => { pararRelogios(); ok(); };
    u.onerror = () => { pararRelogios(); ok(); };
    speechSynthesis.speak(u);
  });
}

/**
 * Fala uma ou mais partes, na ordem, cada uma na voz da sua língua. Usa a voz natural
 * escolhida quando ela já está baixada; senão, a do aparelho. Termina quando acaba de
 * falar ou quando outra fala começa.
 */
export async function falar(
  partes: Parte | Parte[], fator = 1, chave?: string,
  opcoes: { aoParte?: (parte: Parte | null) => void } = {},
): Promise<void> {
  const lista = (Array.isArray(partes) ? partes : [partes]).filter((p) => p.texto.trim());
  const ocupado = !!fonte || (typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending));
  pararFala();
  const minha = geracao;
  if (!lista.length) return;
  marcarFala(chave ?? null);
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
    const vel = Math.max(0.35, Math.min(2, atual.velocidade[p.lingua] * fatorReal(p, fator)));
    return vozBaixada(id)
      .then((ok) => (ok ? sintetizar(id, textoParaFalar(p.texto, p.lingua, fator), vel) : null))
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
    opcoes.aoParte?.(lista[i]);
    for (let r = 0; r < repeticoes(lista[i], fator) && minha === geracao; r++) {
      if (r) await esperar(550); // a pausa entre as duas vezes da palavra, no lento
      if (audio) await tocarAmostras(audio.amostras, audio.taxa, minha, lista[i].texto, lista[i].lingua === 'en' && fator < LIMITE_LENTO);
      else await falarNoAparelho(lista[i], fator, minha);
    }
    if (minha === geracao) { pararRelogios(); marcarPalavra(null); }
  }
  if (minha === geracao) { marcarFala(null); opcoes.aoParte?.(null); }
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