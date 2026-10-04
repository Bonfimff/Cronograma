/**
 * Registro de atividades para o relatório de progresso.
 *
 * Cada jogo, aula ou rodada de fala abre um registro, avisa cada acerto e erro, e o
 * registro se fecha sozinho quando a pessoa sai da tela. Só entra no histórico o que
 * teve pelo menos uma resposta (abrir e fechar um jogo não conta).
 *
 * Cada resposta guarda, além do acerto: a habilidade que ela mostra (reconhecer, lembrar,
 * ouvir, falar), quanto tempo levou desde a anterior e se teve dica. É com isso que o
 * modelo de memória (memoria.ts) estima quanto cada palavra dura na cabeça.
 */

import type { Atividade, Habilidade, TentativaPalavra, TipoAtividade } from '../types';
import { store } from '../storage/store';

/** Mais que isso, os mais antigos saem (meses de uso diário cabem com folga). */
export const MAXIMO_ATIVIDADES = 4000;
/** Mais que isso entre duas respostas é pausa, não tempo para lembrar. */
const PAUSA_MS = 60_000;

export interface Detalhe {
  ouvido?: string;
  hab?: Habilidade;
  dica?: boolean;
}

export interface Registro {
  /** o segundo argumento aceita só o que foi ouvido (texto), como antes */
  acerto: (en: string, detalhe?: string | Detalhe) => void;
  erro: (en: string, detalhe?: string | Detalhe) => void;
  /** fecha e grava; chamar de novo não grava duas vezes */
  fechar: () => void;
}

/** O que cada atividade costuma pedir, quando a tela não diz. */
export function habilidadePadrao(origem: string, ouvido?: string): Habilidade {
  if (ouvido !== undefined) return 'falar';
  if (origem === 'fala-rapida') return 'falar';
  if (origem === 'flashcards' || origem === 'cruzadas') return 'lembrar';
  return 'reconhecer';
}

const novoId = () => `at-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function guardarAtividade(a: Atividade): void {
  store.update((d) => {
    d.atividades = [...(d.atividades ?? []), a].slice(-MAXIMO_ATIVIDADES);
  });
}

export function abrirRegistro(tipo: TipoAtividade, origem: string): Registro {
  const inicio = new Date();
  let anterior = inicio.getTime();
  const palavras: TentativaPalavra[] = [];
  let fechado = false;
  const anotar = (en: string, ok: boolean, detalhe?: string | Detalhe) => {
    if (fechado || !en) return;
    const d: Detalhe = typeof detalhe === 'string' ? { ouvido: detalhe } : detalhe ?? {};
    const agora = Date.now();
    const ms = agora - anterior;
    anterior = agora;
    palavras.push({
      en: en.trim(),
      ok,
      ...(d.ouvido !== undefined ? { ouvido: d.ouvido.slice(0, 80) } : {}),
      hab: d.hab ?? habilidadePadrao(origem, d.ouvido),
      ...(ms < PAUSA_MS ? { ms } : {}),
      ...(d.dica ? { dica: true } : {}),
      t: Math.round((agora - inicio.getTime()) / 1000),
    });
  };
  return {
    acerto: (en, d) => anotar(en, true, d),
    erro: (en, d) => anotar(en, false, d),
    fechar: () => {
      if (fechado) return;
      fechado = true;
      if (!palavras.length) return;
      guardarAtividade({
        id: novoId(),
        quando: inicio.toISOString(),
        tipo,
        origem,
        duracaoSeg: Math.max(1, Math.round((Date.now() - inicio.getTime()) / 1000)),
        acertos: palavras.filter((p) => p.ok).length,
        erros: palavras.filter((p) => !p.ok).length,
        palavras,
      });
    },
  };
}
