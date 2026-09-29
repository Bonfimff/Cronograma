/**
 * Números do "Meu progresso".
 *
 * Tudo sai do que já existe no aparelho: o histórico por conteúdo (as sessões
 * concluídas viram eventos), as próprias sessões (datas, minutos e acertos) e o
 * placar de acertos e erros por palavra, que os jogos vão anotando.
 *
 * Aqui não há React nem DOM: só contas sobre os dados.
 */

import { daysBetween, today } from '../dates';
import type { ContentRef, UserData } from '../types';
import type { WordStats } from '../games/wordTetris';

/** Quantas vezes a palavra apareceu num jogo e como foi. */
export interface WordScore {
  en: string;
  certos: number;
  errados: number;
  tentativas: number;
  taxa: number; // 0..1
}

export function wordScores(stats: WordStats): WordScore[] {
  return Object.entries(stats).map(([en, s]) => {
    const tentativas = s.c + s.w;
    return { en, certos: s.c, errados: s.w, tentativas, taxa: tentativas ? s.c / tentativas : 0 };
  });
}

/** Palavras com melhor aproveitamento. Só conta quem já apareceu algumas vezes. */
export function bestWords(stats: WordStats, minimo = 3, quantas = 8): WordScore[] {
  return wordScores(stats)
    .filter((p) => p.tentativas >= minimo)
    .sort((a, b) => b.taxa - a.taxa || b.tentativas - a.tentativas)
    .slice(0, quantas);
}

/** Palavras que mais escapam: erram pelo menos uma em cada quatro. */
export function hardestWords(stats: WordStats, minimo = 2, quantas = 8, teto = 0.75): WordScore[] {
  return wordScores(stats)
    .filter((p) => p.errados >= 1 && p.tentativas >= minimo && p.taxa <= teto)
    .sort((a, b) => a.taxa - b.taxa || b.errados - a.errados)
    .slice(0, quantas);
}

export interface DayStudy {
  date: string;
  sessoes: number;
  minutos: number;
}

export interface Frequency {
  dias: DayStudy[]; // do mais antigo para o mais novo, dentro da janela
  diasEstudados: number;
  minutosTotais: number;
  sequenciaAtual: number; // dias seguidos até hoje (ou até ontem)
  melhorSequencia: number;
  porSemana: number; // média de dias estudados por semana na janela
}

/** Frequência de estudo nos últimos `janela` dias (padrão: 12 semanas). */
export function frequency(data: UserData, agora = today(), janela = 84): Frequency {
  const feitas = data.sessions.filter((s) => s.status === 'done');
  const porDia = new Map<string, DayStudy>();
  for (const s of feitas) {
    const dia = (s.finishedAt ?? s.date).slice(0, 10);
    const atual = porDia.get(dia) ?? { date: dia, sessoes: 0, minutos: 0 };
    atual.sessoes += 1;
    atual.minutos += s.result?.durationMin ?? 0;
    porDia.set(dia, atual);
  }

  const dias: DayStudy[] = [];
  for (let i = janela - 1; i >= 0; i--) {
    const d = new Date(agora);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    dias.push(porDia.get(iso) ?? { date: iso, sessoes: 0, minutos: 0 });
  }

  const estudou = (d: DayStudy) => d.sessoes > 0;
  const diasEstudados = dias.filter(estudou).length;
  const minutosTotais = dias.reduce((t, d) => t + d.minutos, 0);

  let melhor = 0, corrente = 0;
  for (const d of dias) {
    corrente = estudou(d) ? corrente + 1 : 0;
    melhor = Math.max(melhor, corrente);
  }

  // a sequência atual só quebra depois de um dia inteiro sem estudo
  let sequencia = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    if (estudou(dias[i])) sequencia++;
    else if (i === dias.length - 1) continue; // hoje ainda pode acontecer
    else break;
  }

  return {
    dias,
    diasEstudados,
    minutosTotais,
    sequenciaAtual: sequencia,
    melhorSequencia: melhor,
    porSemana: Math.round((diasEstudados / (janela / 7)) * 10) / 10,
  };
}

export interface LearningPace {
  ref: ContentRef;
  dias: number; // do primeiro contato até ficar consolidado
}

export interface LearningSpeed {
  concluidos: LearningPace[];
  emAndamento: number; // conteúdos vistos que ainda não consolidaram
  mediana: number | null; // dias
  media: number | null;
  maisRapido: LearningPace | null;
  maisLento: LearningPace | null;
}

/**
 * Velocidade de aprendizado: quantos dias separam o primeiro encontro com um
 * conteúdo da hora em que ele ficou consolidado. A mediana conta mais que a
 * média, porque um único conteúdo esquecido por meses entorta a média.
 */
export function learningSpeed(data: UserData): LearningSpeed {
  const primeiro = new Map<ContentRef, string>();
  const fechado = new Map<ContentRef, string>();

  for (const h of data.history) {
    const antes = primeiro.get(h.ref);
    if (!antes || h.date < antes) primeiro.set(h.ref, h.date);
    if (h.event === 'consolidated') {
      const atual = fechado.get(h.ref);
      if (!atual || h.date < atual) fechado.set(h.ref, h.date);
    }
  }

  const concluidos: LearningPace[] = [];
  for (const [ref, fim] of fechado) {
    const inicio = primeiro.get(ref);
    if (inicio) concluidos.push({ ref, dias: Math.max(0, daysBetween(inicio, fim)) });
  }
  concluidos.sort((a, b) => a.dias - b.dias);

  const n = concluidos.length;
  const mediana = n === 0 ? null
    : n % 2 ? concluidos[(n - 1) / 2].dias
    : Math.round((concluidos[n / 2 - 1].dias + concluidos[n / 2].dias) / 2);
  const media = n === 0 ? null : Math.round((concluidos.reduce((t, c) => t + c.dias, 0) / n) * 10) / 10;

  return {
    concluidos,
    emAndamento: primeiro.size - n,
    mediana,
    media,
    maisRapido: concluidos[0] ?? null,
    maisLento: concluidos[n - 1] ?? null,
  };
}

export interface ExerciseAccuracy {
  total: number;
  certos: number;
  taxa: number | null; // 0..1
}

/** Aproveitamento nos exercícios das folhas corrigidas. */
export function exerciseAccuracy(data: UserData): ExerciseAccuracy {
  let total = 0, certos = 0;
  for (const s of data.sessions) {
    if (!s.result) continue;
    total += s.result.exercises.total;
    certos += s.result.exercises.correct;
  }
  return { total, certos, taxa: total ? certos / total : null };
}

export interface WeekStudy {
  inicio: string; // segunda-feira
  dias: number;
  minutos: number;
}

/** Junta os dias em semanas, para o gráfico da frequência. */
export function byWeek(freq: Frequency): WeekStudy[] {
  const semanas: WeekStudy[] = [];
  for (let i = 0; i < freq.dias.length; i += 7) {
    const pedaco = freq.dias.slice(i, i + 7);
    semanas.push({
      inicio: pedaco[0].date,
      dias: pedaco.filter((d) => d.sessoes > 0).length,
      minutos: pedaco.reduce((t, d) => t + d.minutos, 0),
    });
  }
  return semanas;
}
