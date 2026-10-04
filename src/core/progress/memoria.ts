/**
 * Quanto cada palavra dura na memória, e até onde a pessoa já sabe usá-la.
 *
 * 1. Memória (FSRS, o algoritmo do Anki): cada palavra tem estabilidade (em quantos dias a
 *    chance de lembrar cai para 90%), dificuldade (1 a 10) e a chance de lembrar agora,
 *    que cai com o tempo. Cada dia de prática conta uma vez: a primeira resposta do dia
 *    vira uma nota (errou, difícil, bom, fácil) pelo acerto, pela dica e pelo tempo.
 * 2. Escada de domínio (Nation): vista → reconhece → lembra sozinho → entende ouvindo →
 *    pronuncia → usa por conta própria (no chat).
 * 3. Nível por habilidade (Elo, como no xadrez): sobe quando acerta palavra difícil, desce
 *    quando erra palavra fácil. Leve e confiável para um aluno só.
 *
 * As fontes: o registro de atividades (registro.ts), o histórico das folhas e as mensagens
 * que a pessoa escreveu em inglês no chat (cada palavra do vocabulário usada ali conta como
 * "usar").
 */

import type { Habilidade, UserData } from '../types';

export interface Evento {
  en: string;
  /** milissegundos desde 1970 */
  ms: number;
  ok: boolean;
  hab: Habilidade;
  tempo?: number;
  dica?: boolean;
}

export interface MemoriaPalavra {
  en: string;
  estabilidade: number;
  dificuldade: number;
  /** chance de lembrar agora, 0..1 */
  retencao: number;
  ultima: number;
  dias: number;
  lapsos: number;
  respostas: number;
  /** o degrau mais alto acertado: 0 vista, 1 reconhece, 2 lembra, 3 ouve, 4 pronuncia, 5 usa */
  nivel: number;
  /** as habilidades em que já acertou ao menos uma vez */
  habs: Habilidade[];
}

export interface LinhaHabilidade {
  hab: Habilidade;
  rotulo: string;
  respostas: number;
  taxa: number | null;
  /** tempo típico de resposta certa, em segundos */
  segundos: number | null;
  /** 0..100 */
  nivel: number;
  /** o nível no fim de cada uma das últimas 8 semanas */
  historico: number[];
}

export interface Memoria {
  palavras: MemoriaPalavra[];
  /** soma das chances: quantas palavras se espera que você lembre hoje */
  lembradasHoje: number;
  retencaoMedia: number | null;
  estabilidadeMediana: number | null;
  emRisco: MemoriaPalavra[];
  escada: { rotulo: string; quantas: number }[];
  habilidades: LinhaHabilidade[];
  /** acerto na primeira resposta de 1 a 3 dias depois, pelo período do dia em que estudou */
  retencaoPorFaixa: { nome: string; testes: number; taxa: number | null }[];
}

export const DEGRAUS = ['Vista', 'Reconhece', 'Lembra sozinho', 'Entende ouvindo', 'Pronuncia', 'Usa no chat'];
const NIVEL_DA_HAB: Record<Habilidade, number> = { reconhecer: 1, lembrar: 2, ouvir: 3, falar: 4, usar: 5 };
export const HAB_DO_NIVEL: Habilidade[] = ['reconhecer', 'reconhecer', 'lembrar', 'ouvir', 'falar', 'usar'];
const ROTULO_HAB: Record<Habilidade, string> = {
  reconhecer: 'Reconhecer', lembrar: 'Lembrar sozinho', ouvir: 'Entender ouvindo', falar: 'Pronunciar', usar: 'Usar no chat',
};
const DIA_MS = 86_400_000;

// ---------- FSRS-4.5 (pesos padrão, ajustados em milhões de revisões) ----------
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const FATOR = 19 / 81, CURVA = -0.5;
const limitar = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Chance de lembrar depois de `t` dias com estabilidade `s`. */
export const retencao = (t: number, s: number) => Math.pow(1 + (FATOR * t) / s, CURVA);
const d0 = (g: number) => limitar(W[4] - (g - 3) * W[5], 1, 10);

export function revisar(s: number | null, d: number, dias: number, g: number): { s: number; d: number } {
  if (s === null) return { s: W[g - 1], d: d0(g) };
  const r = retencao(dias, s);
  const dNovo = limitar(W[7] * d0(4) + (1 - W[7]) * (d - W[6] * (g - 3)), 1, 10);
  const sNovo = g === 1
    ? W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r))
    : s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  return { s: Math.max(0.1, Math.min(sNovo, 36500)), d: dNovo };
}

/** A nota de uma resposta: 1 errou, 2 difícil (dica ou demorou), 3 bom, 4 fácil (rápido, ou usou sozinho). */
export function nota(e: Evento): number {
  if (!e.ok) return 1;
  if (e.hab === 'usar') return 4;
  if (e.dica || (e.tempo ?? 0) > 10_000) return 2;
  if (e.tempo !== undefined && e.tempo < 2500 && e.hab !== 'falar') return 4;
  return 3;
}

// ---------- eventos ----------
const PALAVRA = /[a-z][a-z']+/g;
const COMUNS = new Set(['the', 'and', 'you', 'are', 'is', 'am', 'to', 'of', 'in', 'on', 'it', 'my', 'me', 'a', 'an', 'at', 'for', 'do', 'be', 'so', 'no', 'yes', 'ok', 'oi']);

/** Junta as respostas de todas as fontes, em ordem de tempo. `refParaEn` traduz "word:rest" → "rest". */
export function eventos(data: UserData, refParaEn: (ref: string) => string | undefined, vocabulario: Set<string>): Evento[] {
  const out: Evento[] = [];
  for (const a of data.atividades ?? []) {
    const inicio = new Date(a.quando).getTime();
    for (const p of a.palavras) {
      out.push({ en: p.en.toLowerCase(), ms: inicio + (p.t ?? 0) * 1000, ok: p.ok, hab: p.hab ?? (p.ouvido !== undefined ? 'falar' : 'reconhecer'), tempo: p.ms, dica: p.dica });
    }
  }
  // folhas: o que foi marcado ao fim de cada estudo (só palavras)
  for (const h of data.history) {
    if (!h.ref.startsWith('word:')) continue;
    const en = refParaEn(h.ref);
    if (!en) continue;
    const ms = new Date(`${h.date}T12:00:00`).getTime();
    if (h.event === 'consolidated') out.push({ en: en.toLowerCase(), ms, ok: true, hab: 'lembrar' });
    else if (h.event === 'review_needed' || h.event === 'reinforce_needed') out.push({ en: en.toLowerCase(), ms, ok: false, hab: 'lembrar' });
  }
  // chat: palavra do vocabulário escrita pela pessoa em inglês = usada por conta própria
  for (const t of data.chat ?? []) {
    if (t.role !== 'user' || !t.at) continue;
    const vistas = new Set((t.content.toLowerCase().match(PALAVRA) ?? []).filter((w) => vocabulario.has(w) && !COMUNS.has(w)));
    for (const en of vistas) out.push({ en, ms: new Date(t.at).getTime(), ok: true, hab: 'usar' });
  }
  return out.filter((e) => e.en && Number.isFinite(e.ms)).sort((a, b) => a.ms - b.ms);
}

// ---------- o cálculo ----------
const diaLocal = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const faixaDe = (ms: number) => {
  const h = new Date(ms).getHours();
  return h < 5 ? 'Madrugada' : h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
};
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};
const sigmoide = (x: number) => 1 / (1 + Math.exp(-x));

export function memoria(evs: Evento[], agora = Date.now()): Memoria {
  const porPalavra = new Map<string, Evento[]>();
  for (const e of evs) porPalavra.set(e.en, [...(porPalavra.get(e.en) ?? []), e]);

  // Elo: um nível por habilidade e uma dificuldade por palavra
  const theta: Record<Habilidade, number> = { reconhecer: 0, lembrar: 0, ouvir: 0, falar: 0, usar: 0 };
  const contagem: Record<string, number> = {};
  const beta = new Map<string, number>();
  const semanas: number[] = []; // início de cada uma das 8 últimas semanas
  for (let k = 7; k >= 0; k--) semanas.push(agora - k * 7 * DIA_MS);
  const historico: Record<Habilidade, number[]> = { reconhecer: [], lembrar: [], ouvir: [], falar: [], usar: [] };
  let proxima = 0;
  const fotografar = (ate: number) => {
    while (proxima < semanas.length && semanas[proxima] <= ate) {
      (Object.keys(theta) as Habilidade[]).forEach((h) => historico[h].push(Math.round(100 * sigmoide(theta[h]))));
      proxima++;
    }
  };
  for (const e of evs) {
    fotografar(e.ms);
    if (e.hab === 'usar') continue; // usar é só acerto: não diz nada sobre dificuldade
    const b = beta.get(e.en) ?? 0;
    const p = sigmoide(theta[e.hab] - b);
    const n = (contagem[e.hab] = (contagem[e.hab] ?? 0) + 1);
    const nw = (contagem[`w:${e.en}`] = (contagem[`w:${e.en}`] ?? 0) + 1);
    theta[e.hab] += (0.8 / (1 + 0.05 * n)) * ((e.ok ? 1 : 0) - p);
    beta.set(e.en, b - (0.8 / (1 + 0.05 * nw)) * ((e.ok ? 1 : 0) - p));
  }
  fotografar(agora + 1);

  // memória e escada por palavra
  const palavras: MemoriaPalavra[] = [];
  const testes: Record<string, { n: number; ok: number }> = {};
  for (const [en, lista] of porPalavra) {
    let s: number | null = null, d = 5, ultimoDia = '', ultimaMs = 0, lapsos = 0, dias = 0, nivel = 0;
    let estudoAnterior: { dia: string; ms: number } | null = null;
    const habs = new Set<Habilidade>();
    for (const e of lista) {
      if (e.ok) { nivel = Math.max(nivel, NIVEL_DA_HAB[e.hab]); habs.add(e.hab); }
      const dia = diaLocal(e.ms);
      if (dia === ultimoDia) continue; // um dia, uma revisão
      // retenção no dia seguinte: a primeira resposta 1 a 3 dias depois do estudo anterior
      if (estudoAnterior && e.ms - estudoAnterior.ms <= 3.5 * DIA_MS && e.ms - estudoAnterior.ms >= 0.5 * DIA_MS) {
        const f = (testes[faixaDe(estudoAnterior.ms)] ??= { n: 0, ok: 0 });
        f.n++; if (e.ok) f.ok++;
      }
      const g = nota(e);
      const r = revisar(s, d, s === null ? 0 : (e.ms - ultimaMs) / DIA_MS, g);
      s = r.s; d = r.d;
      if (g === 1 && dias > 0) lapsos++;
      dias++;
      ultimoDia = dia; ultimaMs = e.ms;
      estudoAnterior = { dia, ms: e.ms };
    }
    palavras.push({
      en, estabilidade: s ?? 0.1, dificuldade: d, retencao: retencao((agora - ultimaMs) / DIA_MS, s ?? 0.1),
      ultima: ultimaMs, dias, lapsos, respostas: lista.length, nivel, habs: [...habs],
    });
  }

  const habilidades: LinhaHabilidade[] = (Object.keys(theta) as Habilidade[]).map((hab) => {
    const delas = evs.filter((e) => e.hab === hab);
    const certas = delas.filter((e) => e.ok);
    const tempo = mediana(certas.map((e) => e.tempo).filter((t): t is number => t !== undefined));
    return {
      hab, rotulo: ROTULO_HAB[hab], respostas: delas.length,
      taxa: delas.length ? certas.length / delas.length : null,
      segundos: tempo === null ? null : Math.round(tempo / 100) / 10,
      nivel: Math.round(100 * sigmoide(theta[hab])),
      historico: historico[hab],
    };
  });

  const comMemoria = palavras.filter((p) => p.dias > 0);
  return {
    palavras,
    lembradasHoje: Math.round(comMemoria.reduce((s, p) => s + p.retencao, 0)),
    retencaoMedia: comMemoria.length ? comMemoria.reduce((s, p) => s + p.retencao, 0) / comMemoria.length : null,
    estabilidadeMediana: mediana(comMemoria.map((p) => p.estabilidade)),
    emRisco: comMemoria.filter((p) => p.retencao < 0.85).sort((a, b) => a.retencao - b.retencao).slice(0, 12),
    // cada degrau conta quem já acertou aquela habilidade (pronunciar não prova que entende ouvindo)
    escada: DEGRAUS.map((rotulo, i) => ({
      rotulo, quantas: i === 0 ? palavras.length : palavras.filter((p) => p.habs.includes(HAB_DO_NIVEL[i])).length,
    })),
    habilidades,
    retencaoPorFaixa: ['Madrugada', 'Manhã', 'Tarde', 'Noite'].map((nome) => {
      const f = testes[nome];
      return { nome, testes: f?.n ?? 0, taxa: f?.n ? f.ok / f.n : null };
    }),
  };
}
