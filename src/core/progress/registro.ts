/**
 * Registro de atividades para o relatório de progresso.
 *
 * Cada jogo, aula ou rodada de fala abre um registro, avisa cada acerto e erro, e o
 * registro se fecha sozinho quando a pessoa sai da tela. Só entra no histórico o que
 * teve pelo menos uma resposta (abrir e fechar um jogo não conta).
 */

import type { Atividade, TentativaPalavra, TipoAtividade } from '../types';
import { store } from '../storage/store';

/** Mais que isso, os mais antigos saem (meses de uso diário cabem com folga). */
export const MAXIMO_ATIVIDADES = 4000;

export interface Registro {
  acerto: (en: string, ouvido?: string) => void;
  erro: (en: string, ouvido?: string) => void;
  /** fecha e grava; chamar de novo não grava duas vezes */
  fechar: () => void;
}

const novoId = () => `at-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function guardarAtividade(a: Atividade): void {
  store.update((d) => {
    d.atividades = [...(d.atividades ?? []), a].slice(-MAXIMO_ATIVIDADES);
  });
}

export function abrirRegistro(tipo: TipoAtividade, origem: string): Registro {
  const inicio = new Date();
  const palavras: TentativaPalavra[] = [];
  let fechado = false;
  const anotar = (en: string, ok: boolean, ouvido?: string) => {
    if (!fechado && en) palavras.push({ en: en.trim(), ok, ...(ouvido ? { ouvido: ouvido.slice(0, 80) } : {}) });
  };
  return {
    acerto: (en, ouvido) => anotar(en, true, ouvido),
    erro: (en, ouvido) => anotar(en, false, ouvido),
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