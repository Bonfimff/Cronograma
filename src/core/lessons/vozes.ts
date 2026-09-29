/**
 * Vozes e ritmo da leitura, escolhidos pelo usuário.
 *
 * O navegador oferece uma lista de vozes que muda de aparelho para aparelho, e
 * a qualidade varia muito: as mais naturais costumam ser as marcadas como
 * "Natural", "Neural" ou "Online", e as piores são as sintetizadas localmente
 * pelo eSpeak. Aqui a lista é ordenada por essa pista e a escolha fica no
 * aparelho, porque uma voz que existe num telefone pode não existir em outro.
 */

export type Lingua = 'en' | 'pt';

export interface AjustesVoz {
  /** Nome da voz escolhida, como o navegador a chama. Vazio = a do sistema. */
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
