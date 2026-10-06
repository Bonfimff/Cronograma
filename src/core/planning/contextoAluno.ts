/**
 * O que o aluno já sabe, para quem monta a semana (uma pessoa ou uma IA).
 *
 * Sai no pacote semanal como o bloco "aluno" (formato semana@2): o vocabulário com o estado
 * de cada palavra (do modelo de memória, core/progress/memoria.ts), as dificuldades e o que
 * já foi estudado. Com isso a aula nova é montada em cima do que já está firme, e as palavras
 * quase esquecidas voltam no momento certo.
 *
 * Cada palavra vai numa linha curta, [inglês, português, estado, chance de lembrar, degrau],
 * para caber num chat de IA mesmo com centenas de palavras.
 */

import type { ContentRef, UserData } from '../types';
import { content } from '../content/repository';
import { relatorio } from '../progress/relatorio';

export type EstadoPalavra = 'firme' | 'estudando' | 'quase_esquecida' | 'nao_praticada';
/** [inglês, português, estado, chance de lembrar hoje (0..1), degrau da escada (0..5)] */
export type LinhaVocabulario = [string, string, EstadoPalavra, number, number];

export interface ContextoAluno {
  $leia_me: string[];
  gerado_em: string;
  vocabulario: LinhaVocabulario[];
  dificuldades: { palavras: string[]; pronuncia: string[] };
  ja_estudado: ContentRef[];
  ritmo: Ritmo;
}

/**
 * Quantas palavras novas cabem na semana: decidido pelo app, não pela IA.
 *
 * Aprender não é somar palavras por dia: cada pessoa fixa num ritmo, e o que ainda está em
 * treino (estudando, quase esquecida) precisa de espaço para firmar. A conta é por semana:
 * quanto mais palavras em treino e quanto menor a retenção, menos palavras novas. Com o treino
 * cheio, a semana é só de reforço (0 novas).
 */
export interface Ritmo {
  novas_na_semana: number;
  em_treino: number;
  quase_esquecidas: number;
  retencao_media: number | null;
  motivo: string;
}

/** Teto de palavras novas numa semana, quando nada está pendente. */
export const NOVAS_MAXIMO = 10;

export function calcularRitmo(vocab: LinhaVocabulario[], retencaoMedia: number | null): Ritmo {
  const quase = vocab.filter((l) => l[2] === 'quase_esquecida').length;
  const emTreino = vocab.filter((l) => l[2] === 'estudando' || l[2] === 'quase_esquecida').length;
  let novas = Math.max(0, NOVAS_MAXIMO - Math.floor(emTreino / 3));
  const motivos = [`${emTreino} ${emTreino === 1 ? 'palavra' : 'palavras'} ainda em treino`];
  if (quase >= 8) { novas = Math.min(novas, 2); motivos.push(`${quase} quase esquecidas pedem reforço antes de novidade`); }
  if (retencaoMedia !== null && retencaoMedia < 0.75) { novas = Math.floor(novas / 2); motivos.push(`retenção média de ${Math.round(retencaoMedia * 100)}%`); }
  return {
    novas_na_semana: novas,
    em_treino: emTreino,
    quase_esquecidas: quase,
    retencao_media: retencaoMedia === null ? null : Math.round(retencaoMedia * 100) / 100,
    motivo: novas === 0
      ? `Semana de reforço, sem palavras novas: ${motivos.join('; ')}.`
      : `Até ${novas} palavras ou expressões novas na semana: ${motivos.join('; ')}.`,
  };
}

/** Acima disso, vão as palavras que mais importam (em estudo, quase esquecidas e as firmes mais usadas). */
export const MAXIMO_VOCABULARIO = 600;

export const LEIA_ME_ALUNO = [
  'Bloco gerado pelo aplicativo: o que o aluno já sabe. Não precisa ser devolvido na resposta (é ignorado na importação).',
  'vocabulario: [inglês, português, estado, chance de lembrar hoje (0 a 1), degrau (0 vista, 1 reconhece, 2 lembra sozinho, 3 entende ouvindo, 4 pronuncia, 5 usa no chat)].',
  'estado "firme": use à vontade como apoio nos exemplos e exercícios.',
  'estado "estudando": repita em contexto, sem cartão próprio.',
  'estado "quase_esquecida": coloque em palavras.revisar de alguma sessão da semana (de preferência no aquecimento).',
  'estado "nao_praticada": está na lista do aluno, mas ainda não foi praticada; pode virar palavra nova.',
  'Palavra fora desta lista é desconhecida: só use se ela estiver em palavras.novas daquela sessão.',
  'ritmo.novas_na_semana: quantas palavras ou expressões NOVAS cabem nesta semana inteira, calculado pelo app a partir do que ainda está em treino. Não passe desse número. Distribua as novas pela semana como fizer sentido (não precisa ser todo dia); as outras aulas reforçam e usam o que está em treino. Se for 0, a semana é só de reforço.',
];

export function estadoDe(retencao: number, degrau: number, praticada: boolean): EstadoPalavra {
  if (!praticada) return 'nao_praticada';
  if (retencao < 0.85) return 'quase_esquecida';
  return degrau >= 2 ? 'firme' : 'estudando';
}

export function contextoDoAluno(data: UserData, hoje = new Date().toISOString().slice(0, 10)): ContextoAluno {
  const r = relatorio(data, hoje);
  const mem = new Map(r.memoria.palavras.map((p) => [p.en.toLowerCase(), p]));
  // a lista do aluno: as palavras que ele criou ou importou, mais as da base que ele já praticou
  const doAluno = new Set((data.content?.words ?? []).map((w) => w.id));
  const linhas: (LinhaVocabulario & { peso?: number })[] = [];
  const vistas = new Set<string>();
  for (const w of content.words) {
    const en = w.word.trim();
    const k = en.toLowerCase();
    const m = mem.get(k);
    if (!en || vistas.has(k) || (!doAluno.has(w.id) && !m)) continue;
    vistas.add(k);
    const ret = m ? Math.round(m.retencao * 100) / 100 : 0;
    const linha: LinhaVocabulario = [en, w.translations[0]?.text ?? w.core_meaning ?? '', estadoDe(ret, m?.nivel ?? 0, !!m && m.dias > 0), ret, m?.nivel ?? 0];
    linhas.push(Object.assign(linha, { peso: m?.respostas ?? 0 }));
  }
  let vocabulario = linhas;
  if (linhas.length > MAXIMO_VOCABULARIO) {
    const urgentes = linhas.filter((l) => l[2] !== 'firme');
    const firmes = linhas.filter((l) => l[2] === 'firme').sort((a, b) => (b.peso ?? 0) - (a.peso ?? 0));
    vocabulario = [...urgentes, ...firmes].slice(0, MAXIMO_VOCABULARIO);
  }
  const ordem: Record<EstadoPalavra, number> = { quase_esquecida: 0, estudando: 1, nao_praticada: 2, firme: 3 };
  vocabulario.sort((a, b) => ordem[a[2]] - ordem[b[2]] || a[0].localeCompare(b[0]));

  return {
    $leia_me: LEIA_ME_ALUNO,
    gerado_em: hoje,
    vocabulario: vocabulario.map((l) => [l[0], l[1], l[2], l[3], l[4]]),
    dificuldades: {
      palavras: r.dificeis.slice(0, 10).map((p) => p.en),
      pronuncia: r.fala.padroes.filter((p) => p.padrao !== 'outro').slice(0, 4).map((p) => p.nome),
    },
    ja_estudado: [...new Set(data.history.map((h) => h.ref))],
    // o ritmo olha o vocabulário inteiro, não só a parte que coube no arquivo
    ritmo: calcularRitmo(linhas, r.memoria.retencaoMedia),
  };
}
