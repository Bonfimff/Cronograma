/**
 * A análise escrita do progresso: pela IA uma vez por dia (o servidor só recebe o resumo
 * dos números) e, se ela estiver fora do ar, uma versão por regras com os mesmos tópicos.
 */

import { api } from '../api/client';
import { session } from '../api/session';
import { today } from '../dates';
import { resumoParaIA, type Relatorio } from './relatorio';

export interface Analise {
  texto: string;
  fonte: 'ia' | 'regras';
  dia: string;
  /** quantas respostas havia quando foi escrita */
  base?: number;
}

const CHAVE = 'ingles-hibrido:analise-progresso';
const pct = (v: number | null) => (v === null ? '' : `${Math.round(v * 100)}%`);

/** Os mesmos cinco tópicos da IA, montados direto dos números. */
export function analisePorRegras(r: Relatorio): string {
  const g = r.geral;
  const evolucao = g.taxa7 !== null && g.taxaAnterior !== null
    ? `Evolução: seu acerto foi de ${pct(g.taxaAnterior)} para ${pct(g.taxa7)} nesta semana${g.taxa7 >= g.taxaAnterior ? '. Subiu!' : '. Vale revisar.'}`
    : `Evolução: ${g.minutos7} minutos de estudo nos últimos 7 dias, em ${g.atividades7} atividades.`;
  const forte = [...r.porTipo].filter((t) => t.taxa !== null && t.acertos + t.erros >= 5).sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0))[0];
  const fortes = forte
    ? `Pontos fortes: ${forte.rotulo.toLowerCase()} com ${pct(forte.taxa)} de acerto${r.firmes.length ? `; já firmes: ${r.firmes.slice(0, 3).map((p) => p.en).join(', ')}` : ''}.`
    : r.firmes.length ? `Pontos fortes: já firmes: ${r.firmes.slice(0, 4).map((p) => p.en).join(', ')}.` : 'Pontos fortes: faça algumas atividades para aparecerem aqui.';
  const risco = r.memoria.emRisco;
  const dificuldades = risco.length
    ? `Dificuldades: quase esquecidas: ${risco.slice(0, 3).map((p) => `${p.en} (${pct(p.retencao)})`).join(', ')}${r.fala.padroes[0] ? `; na fala, ${r.fala.padroes[0].nome.toLowerCase()}` : ''}.`
    : r.dificeis.length
      ? `Dificuldades: ${r.dificeis.slice(0, 3).map((p) => `${p.en} (${pct(p.taxa)})`).join(', ')}.`
      : 'Dificuldades: nenhuma palavra com muitos erros por enquanto.';
  const horario = r.melhorFaixa && r.melhorFaixa.vezes
    ? `Melhor horário: ${r.melhorFaixa.nome.toLowerCase()}${r.melhorFaixa.taxa !== null ? `, com ${pct(r.melhorFaixa.taxa)} de acerto` : ''}.`
    : 'Melhor horário: estude em horários diferentes para descobrir quando rende mais.';
  const passo = risco.length
    ? `Próximo passo: revise ${risco.slice(0, 2).map((p) => p.en).join(' e ')} hoje nos Flashcards${r.plano.subir[0] ? ` e tente usar ${r.plano.subir[0].en} no chat` : ''}.`
    : r.dificeis.length
    ? `Próximo passo: revise ${r.dificeis.slice(0, 2).map((p) => p.en).join(' e ')} nos Flashcards e repita no Fala-Rápida.`
    : g.sequenciaAtual === 0 ? 'Próximo passo: estude hoje para começar uma sequência.' : `Próximo passo: mantenha a sequência de ${g.sequenciaAtual} dias.`;
  return [evolucao, fortes, dificuldades, horario, passo].map((l) => `• ${l}`).join('\n');
}

export function analiseGuardada(): Analise | null {
  try {
    const a = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Analise | null;
    return a && a.texto ? a : null;
  } catch {
    return null;
  }
}

/** Revisão do dia: usa a guardada se for de hoje (a menos de `forcar`), senão pede à IA. */
export async function analisar(r: Relatorio, forcar = false): Promise<Analise> {
  const guardada = analiseGuardada();
  // refaz no dia seguinte, ou no mesmo dia se entraram 20 respostas novas desde a última
  const base = r.memoria.palavras.reduce((s, p) => s + p.respostas, 0);
  if (!forcar && guardada?.dia === today() && guardada.base !== undefined && Math.abs(base - (guardada.base ?? 0)) < 20) return guardada;
  let nova: Analise = { texto: analisePorRegras(r), fonte: 'regras', dia: today(), base };
  if (session.signedIn && api.configured) {
    try {
      const resposta = await session.withToken((t) => api.analiseProgresso(t, resumoParaIA(r)));
      nova = { texto: resposta.texto, fonte: 'ia', dia: today(), base };
    } catch {
      /* IA fora do ar ou resposta fora do formato: fica a versão por regras */
    }
  }
  try { localStorage.setItem(CHAVE, JSON.stringify(nova)); } catch { /* sem armazenamento */ }
  return nova;
}
