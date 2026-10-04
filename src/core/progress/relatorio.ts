/**
 * O relatório de progresso: junta tudo o que foi feito e tira os números.
 *
 * Fontes, todas já no aparelho (e sincronizadas com a conta):
 * - atividades: jogos, aula em cartões e fala, com acertos, erros e palavras (registro.ts);
 * - sessões: aulas e folhas concluídas, com minutos e o status marcado (ou escaneado);
 * - histórico: quando cada conteúdo entrou e quando firmou;
 * - chat: as mensagens, com horário (inglês escrito, correções, treinos, vocabulário usado).
 *
 * Aqui só há contas: a IA recebe o resumo destes números para escrever a análise, e
 * nunca inventa um dado (ver ResumoParaIA).
 */

import { addDays, daysBetween, today, weekStartOf } from '../dates';
import type { Atividade, UserData } from '../types';

export interface Placar {
  vezes: number;
  minutos: number;
  acertos: number;
  erros: number;
  /** 0..1, ou null sem respostas */
  taxa: number | null;
}

export interface LinhaTipo extends Placar {
  chave: string;
  rotulo: string;
}

export interface Faixa extends Placar {
  nome: 'Madrugada' | 'Manhã' | 'Tarde' | 'Noite';
  de: number;
  ate: number;
}

export interface PalavraPlacar {
  en: string;
  acertos: number;
  erros: number;
  taxa: number;
  ultima: string;
}

export interface Semana {
  inicio: string;
  minutos: number;
  taxa: number | null;
  respostas: number;
}

export interface Relatorio {
  geral: {
    minutos7: number;
    minutosTotal: number;
    diasEstudados30: number;
    sequenciaAtual: number;
    melhorSequencia: number;
    atividades7: number;
    palavrasAprendidas: number;
    palavrasPraticadas: number;
    taxa7: number | null;
    taxaAnterior: number | null;
  };
  porTipo: LinhaTipo[];
  porJogo: LinhaTipo[];
  faixas: Faixa[];
  melhorFaixa: Faixa | null;
  minutosPorHora: number[];
  minutosPorDiaDaSemana: number[];
  semanas: Semana[];
  dificeis: PalavraPlacar[];
  firmes: PalavraPlacar[];
  fala: { tentativas: number; acertos: number; taxa: number | null; confusoes: { en: string; ouvido: string; vezes: number }[] };
  chat: { conversas: number; mensagens: number; emIngles: number; correcoes: number; treinos: number; palavrasUsadas: number };
  folhas: { concluidas: number; escaneadas: number; absorvidas: number; revisar: number; reforcar: number; taxaExercicios: number | null };
}

const ROTULO_JOGO: Record<string, string> = {
  tetris: 'Tetris', palavras: 'Ligar palavras', cruzadas: 'Cruzadas', flashcards: 'Flashcards', 'fala-rapida': 'Fala-Rápida',
};

const FAIXAS: Omit<Faixa, keyof Placar>[] = [
  { nome: 'Madrugada', de: 0, ate: 5 }, { nome: 'Manhã', de: 5, ate: 12 }, { nome: 'Tarde', de: 12, ate: 18 }, { nome: 'Noite', de: 18, ate: 24 },
];

const vazio = (): Placar => ({ vezes: 0, minutos: 0, acertos: 0, erros: 0, taxa: null });
const fechar = <T extends Placar>(p: T): T => ({ ...p, minutos: Math.round(p.minutos), taxa: p.acertos + p.erros ? p.acertos / (p.acertos + p.erros) : null });
const dia = (iso: string) => iso.slice(0, 10);
const horaLocal = (iso: string) => new Date(iso).getHours();
const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Mensagens a menos de 15 minutos uma da outra são a mesma conversa. */
function conversas(data: UserData): { inicio: string; minutos: number; turnos: number }[] {
  const turnos = [...(data.chat ?? [])].filter((t) => t.at).sort((a, b) => a.at.localeCompare(b.at));
  const out: { inicio: string; fim: number; turnos: number }[] = [];
  for (const t of turnos) {
    const ms = new Date(t.at).getTime();
    const ultima = out[out.length - 1];
    if (ultima && ms - ultima.fim < 15 * 60_000) { ultima.fim = ms; ultima.turnos++; } else out.push({ inicio: t.at, fim: ms, turnos: 1 });
  }
  return out.map((c) => ({ inicio: c.inicio, minutos: Math.max(1, (c.fim - new Date(c.inicio).getTime()) / 60_000 + 1), turnos: c.turnos }));
}

/** Tudo o que conta tempo, num formato só: quando, quantos minutos e de que tipo. */
interface Momento { quando: string; minutos: number; acertos: number; erros: number; tipo: string }

function momentos(data: UserData): Momento[] {
  const out: Momento[] = (data.atividades ?? []).map((a) => ({
    quando: a.quando, minutos: a.duracaoSeg / 60, acertos: a.acertos, erros: a.erros,
    tipo: a.tipo === 'jogo' ? 'jogo' : a.tipo,
  }));
  for (const s of data.sessions) {
    if (s.status !== 'done' || !s.result) continue;
    const quando = s.finishedAt ?? `${s.date}T12:00:00`;
    out.push({ quando, minutos: s.result.durationMin || 0, acertos: s.result.exercises?.correct ?? 0,
      erros: Math.max(0, (s.result.exercises?.total ?? 0) - (s.result.exercises?.correct ?? 0)), tipo: 'folha' });
  }
  for (const c of conversas(data)) out.push({ quando: c.inicio, minutos: c.minutos, acertos: 0, erros: 0, tipo: 'chat' });
  return out.sort((a, b) => a.quando.localeCompare(b.quando));
}

function palavras(atividades: Atividade[]): PalavraPlacar[] {
  const m = new Map<string, PalavraPlacar>();
  for (const a of atividades) {
    for (const p of a.palavras) {
      const k = p.en.toLowerCase();
      const cur = m.get(k) ?? { en: p.en, acertos: 0, erros: 0, taxa: 0, ultima: a.quando };
      if (p.ok) cur.acertos++; else cur.erros++;
      cur.ultima = a.quando > cur.ultima ? a.quando : cur.ultima;
      m.set(k, cur);
    }
  }
  return [...m.values()].map((p) => ({ ...p, taxa: p.acertos / (p.acertos + p.erros) }));
}

function sequencias(dias: Set<string>, hoje: string): { atual: number; melhor: number } {
  let atual = 0;
  for (let d = dias.has(hoje) ? hoje : addDays(hoje, -1); dias.has(d); d = addDays(d, -1)) atual++;
  const ordenados = [...dias].sort();
  let melhor = 0, corrida = 0, anterior = '';
  for (const d of ordenados) {
    corrida = anterior && daysBetween(anterior, d) === 1 ? corrida + 1 : 1;
    melhor = Math.max(melhor, corrida);
    anterior = d;
  }
  return { atual, melhor };
}

export function relatorio(data: UserData, hoje = today()): Relatorio {
  const ats = data.atividades ?? [];
  const ms = momentos(data);
  const corte7 = addDays(hoje, -6), corte14 = addDays(hoje, -13), corte30 = addDays(hoje, -29);
  const dias = new Set(ms.map((m) => diaLocal(m.quando)));
  const seq = sequencias(dias, hoje);
  const taxaDe = (lista: Momento[]) => {
    const a = lista.reduce((s, m) => s + m.acertos, 0), e = lista.reduce((s, m) => s + m.erros, 0);
    return a + e ? a / (a + e) : null;
  };
  const ultimos7 = ms.filter((m) => diaLocal(m.quando) >= corte7);
  const anteriores7 = ms.filter((m) => diaLocal(m.quando) >= corte14 && diaLocal(m.quando) < corte7);

  // por tipo de atividade
  const tipos: Record<string, LinhaTipo> = {};
  const rotulos: Record<string, string> = { aula: 'Aulas', folha: 'Folhas', jogo: 'Jogos', fala: 'Fala', chat: 'Conversa' };
  for (const m of ms) {
    const t = (tipos[m.tipo] ??= { chave: m.tipo, rotulo: rotulos[m.tipo] ?? m.tipo, ...vazio() });
    t.vezes++; t.minutos += m.minutos; t.acertos += m.acertos; t.erros += m.erros;
  }
  const jogos: Record<string, LinhaTipo> = {};
  for (const a of ats.filter((x) => x.tipo === 'jogo' || x.tipo === 'fala')) {
    const j = (jogos[a.origem] ??= { chave: a.origem, rotulo: ROTULO_JOGO[a.origem] ?? a.origem, ...vazio() });
    j.vezes++; j.minutos += a.duracaoSeg / 60; j.acertos += a.acertos; j.erros += a.erros;
  }

  // horários
  const faixas = FAIXAS.map((f) => ({ ...f, ...vazio() }));
  const minutosPorHora = new Array(24).fill(0);
  const minutosPorDiaDaSemana = new Array(7).fill(0);
  for (const m of ms) {
    const h = horaLocal(m.quando);
    const f = faixas.find((x) => h >= x.de && h < x.ate)!;
    f.vezes++; f.minutos += m.minutos; f.acertos += m.acertos; f.erros += m.erros;
    minutosPorHora[h] += m.minutos;
    minutosPorDiaDaSemana[(new Date(m.quando).getDay() + 6) % 7] += m.minutos;
  }
  const faixasFechadas = faixas.map(fechar);
  // melhor horário: o de maior acerto com respostas suficientes (senão, o de mais tempo)
  const comDados = faixasFechadas.filter((f) => f.acertos + f.erros >= 10);
  const melhorFaixa = (comDados.length ? comDados.sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0))[0]
    : [...faixasFechadas].sort((a, b) => b.minutos - a.minutos)[0]) ?? null;

  // semanas (as 8 últimas)
  const semanas: Semana[] = [];
  for (let k = 7; k >= 0; k--) {
    const inicio = weekStartOf(addDays(hoje, -7 * k));
    const fim = addDays(inicio, 7);
    const dentro = ms.filter((m) => diaLocal(m.quando) >= inicio && diaLocal(m.quando) < fim);
    const a = dentro.reduce((s, m) => s + m.acertos, 0), e = dentro.reduce((s, m) => s + m.erros, 0);
    semanas.push({ inicio, minutos: Math.round(dentro.reduce((s, m) => s + m.minutos, 0)), taxa: a + e ? a / (a + e) : null, respostas: a + e });
  }

  // palavras
  const placar = palavras(ats);
  const dificeis = placar.filter((p) => p.erros >= 2 && p.taxa < 0.75).sort((a, b) => a.taxa - b.taxa || b.erros - a.erros).slice(0, 10);
  const firmes = placar.filter((p) => p.acertos >= 3 && p.taxa >= 0.85).sort((a, b) => b.acertos - a.acertos).slice(0, 10);
  const aprendidas = new Set(data.history.filter((h) => h.event === 'consolidated').map((h) => h.ref)).size;

  // fala: o que o reconhecedor ouviu quando errou (as confusões que se repetem)
  const falas = ats.flatMap((a) => (a.tipo === 'fala' || a.origem.startsWith('aula:') ? a.palavras.filter((p) => p.ouvido !== undefined) : []));
  const confusoes = new Map<string, { en: string; ouvido: string; vezes: number }>();
  for (const p of falas.filter((x) => !x.ok && x.ouvido)) {
    const k = `${p.en.toLowerCase()}→${p.ouvido!.toLowerCase()}`;
    const c = confusoes.get(k) ?? { en: p.en, ouvido: p.ouvido!, vezes: 0 };
    c.vezes++;
    confusoes.set(k, c);
  }

  // chat
  const turnos = data.chat ?? [];
  const dela = turnos.filter((t) => t.role === 'user');
  const doAmigo = turnos.filter((t) => t.role === 'assistant');
  const emIngles = dela.filter((t) => /^[\x00-\x7F]*$/.test(t.content) && /\b(i|you|my|is|are|the|what|where|how)\b/i.test(t.content)).length;

  // folhas
  const feitas = data.sessions.filter((s) => s.status === 'done' && s.result);
  const ex = feitas.reduce((s, x) => ({ t: s.t + (x.result!.exercises?.total ?? 0), c: s.c + (x.result!.exercises?.correct ?? 0) }), { t: 0, c: 0 });

  return {
    geral: {
      minutos7: Math.round(ultimos7.reduce((s, m) => s + m.minutos, 0)),
      minutosTotal: Math.round(ms.reduce((s, m) => s + m.minutos, 0)),
      diasEstudados30: [...dias].filter((d) => d >= corte30).length,
      sequenciaAtual: seq.atual,
      melhorSequencia: seq.melhor,
      atividades7: ultimos7.length,
      palavrasAprendidas: aprendidas,
      palavrasPraticadas: placar.length,
      taxa7: taxaDe(ultimos7),
      taxaAnterior: taxaDe(anteriores7),
    },
    porTipo: Object.values(tipos).map(fechar).sort((a, b) => b.minutos - a.minutos),
    porJogo: Object.values(jogos).map(fechar).sort((a, b) => b.vezes - a.vezes),
    faixas: faixasFechadas,
    melhorFaixa,
    minutosPorHora: minutosPorHora.map(Math.round),
    minutosPorDiaDaSemana: minutosPorDiaDaSemana.map(Math.round),
    semanas,
    dificeis,
    firmes,
    fala: {
      tentativas: falas.length,
      acertos: falas.filter((p) => p.ok).length,
      taxa: falas.length ? falas.filter((p) => p.ok).length / falas.length : null,
      confusoes: [...confusoes.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 6),
    },
    chat: {
      conversas: conversas(data).length,
      mensagens: dela.length,
      emIngles,
      correcoes: doAmigo.filter((t) => /Fica assim:|Em inglês, fica assim/.test(t.content)).length,
      treinos: doAmigo.filter((t) => /Treino concluído/.test(t.content)).length,
      palavrasUsadas: new Set(doAmigo.flatMap((t) => [...t.content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].toLowerCase()))).size,
    },
    folhas: {
      concluidas: feitas.length,
      escaneadas: feitas.filter((s) => s.result!.source === 'scan').length,
      absorvidas: feitas.filter((s) => s.result!.mastery === 'absorbed').length,
      revisar: feitas.filter((s) => s.result!.mastery === 'review').length,
      reforcar: feitas.filter((s) => s.result!.mastery === 'reinforce').length,
      taxaExercicios: ex.t ? ex.c / ex.t : null,
    },
  };
}

/** O que vai para a IA escrever a análise: só números e nomes, em texto curto. */
export function resumoParaIA(r: Relatorio): string {
  const pct = (v: number | null) => (v === null ? 'sem dados' : `${Math.round(v * 100)}%`);
  const linhas = [
    `Últimos 7 dias: ${r.geral.minutos7} min de estudo, ${r.geral.atividades7} atividades, acerto ${pct(r.geral.taxa7)} (semana anterior: ${pct(r.geral.taxaAnterior)}).`,
    `Sequência atual: ${r.geral.sequenciaAtual} dias (melhor: ${r.geral.melhorSequencia}). Dias estudados nos últimos 30: ${r.geral.diasEstudados30}.`,
    `Palavras praticadas: ${r.geral.palavrasPraticadas}; firmadas: ${r.geral.palavrasAprendidas}.`,
    'Por tipo: ' + r.porTipo.map((t) => `${t.rotulo} ${t.vezes}x, ${t.minutos} min, acerto ${pct(t.taxa)}`).join('; ') + '.',
    r.porJogo.length ? 'Jogos: ' + r.porJogo.map((j) => `${j.rotulo} ${j.vezes}x, acerto ${pct(j.taxa)}`).join('; ') + '.' : '',
    'Horários: ' + r.faixas.filter((f) => f.vezes).map((f) => `${f.nome} ${f.minutos} min, acerto ${pct(f.taxa)}`).join('; ') + '.',
    r.dificeis.length ? 'Palavras com mais erro: ' + r.dificeis.slice(0, 6).map((p) => `${p.en} (${pct(p.taxa)})`).join(', ') + '.' : '',
    r.firmes.length ? 'Palavras firmes: ' + r.firmes.slice(0, 6).map((p) => p.en).join(', ') + '.' : '',
    r.fala.tentativas ? `Fala: ${r.fala.tentativas} tentativas, acerto ${pct(r.fala.taxa)}.` + (r.fala.confusoes.length ? ' Confusões: ' + r.fala.confusoes.map((c) => `${c.en} soou como "${c.ouvido}"`).join(', ') + '.' : '') : '',
    `Chat: ${r.chat.mensagens} mensagens, ${r.chat.emIngles} em inglês, ${r.chat.correcoes} correções, ${r.chat.treinos} treinos concluídos.`,
    `Folhas: ${r.folhas.concluidas} concluídas (${r.folhas.absorvidas} absorvidas, ${r.folhas.revisar} para revisar, ${r.folhas.reforcar} para reforçar).`,
    'Semanas (minutos, acerto): ' + r.semanas.map((s) => `${s.minutos} min ${pct(s.taxa)}`).join(' | ') + '.',
  ];
  return linhas.filter(Boolean).join('\n');
}

export const _teste = { conversas, momentos, palavras, sequencias, dia };
