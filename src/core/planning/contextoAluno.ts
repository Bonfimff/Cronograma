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
import { palavrasDe } from '../content/repository';
import { relatorio } from '../progress/relatorio';

export type EstadoPalavra = 'firme' | 'estudando' | 'quase_esquecida' | 'nao_praticada';
/** [inglês, português, estado, chance de lembrar hoje (0..1), degrau da escada (0..5)] */
export type LinhaVocabulario = [string, string, EstadoPalavra, number, number];

export interface ContextoAluno {
  $leia_me: string[];
  gerado_em: string;
  vocabulario: LinhaVocabulario[];
  dificuldades: { palavras: string[]; pronuncia: string[] };
  foco: FocoDaSemana;
  ja_estudado: ContentRef[];
  ritmo: Ritmo;
}

/**
 * O que esta semana precisa resolver, já decidido pelo app (progress/relatorio.ts).
 *
 * O estado de cada palavra está no vocabulário, mas lá ele é uma lista de centenas de linhas:
 * quem monta a aula teria de descobrir sozinho por onde começar. Aqui vem pronto o que reforçar
 * agora (as mais perto de serem esquecidas, da mais urgente para a menos) e quem já está firme
 * o bastante para subir um degrau — de reconhecer para lembrar, de lembrar para ouvir, e assim
 * por diante. Subir de degrau é o que transforma palavra reconhecida em palavra usada.
 */
export interface FocoDaSemana {
  /** inglês das palavras em risco, da mais urgente para a menos (até 8) */
  reforcar: string[];
  /** [inglês, o próximo degrau daquela palavra] (até 6) */
  subir: [string, string][];
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
  'foco.reforcar: o que o app já decidiu que esta semana precisa resolver, da palavra mais urgente para a menos. Comece por elas em palavras.revisar e no aquecimento, antes de pensar em novidade.',
  'foco.subir: [palavra, próximo degrau]. São palavras já firmes que pararam num degrau: a semana deve fazer cada uma AVANÇAR, escolhendo a atividade que o degrau pede (ouvir → aula.escuta; pronunciar → aula.fala; usar → missao e chat.treino). Subir de degrau vale mais que acrescentar palavra nova.',
  'dificuldades.pronuncia: os sons que a pessoa erra na Fala. Pelo menos uma dica de app.tips da semana deve atacar um deles, com o par mínimo ou o som escrito.',
  'Conecte, não empilhe: toda palavra nova entra ligada a alguma palavra "firme" desta lista (em related_words e em pelo menos 1 exemplo que use as duas juntas). Palavra nova sozinha, sem ponte com o que já se sabe, é o que mais se esquece.',
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
  for (const w of palavrasDe(data)) {
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
    foco: {
      reforcar: r.plano.revisar.map((p) => p.en),
      subir: r.plano.subir.map((s) => [s.en, s.proximo]),
    },
    ja_estudado: [...new Set(data.history.map((h) => h.ref))],
    // o ritmo olha o vocabulário inteiro, não só a parte que coube no arquivo
    ritmo: calcularRitmo(linhas, r.memoria.retencaoMedia),
  };
}

/** Um item da lista completa do vocabulário, para a tela (sem o limite do arquivo). */
export interface ItemVocabulario {
  ref: ContentRef;
  en: string;
  pt: string;
  classe: string;
  estado: EstadoPalavra;
  /** chance de lembrar hoje (0..1) */
  retencao: number;
  /** degrau da escada (0 vista .. 5 usa no chat) */
  degrau: number;
}

/**
 * O vocabulário da pessoa: as palavras (com o estado da memória) e as expressões, que são
 * conjuntos de palavras. Padrões, gramática e as outras folhas da Biblioteca não entram.
 */
export function vocabularioCompleto(data: UserData, hoje = new Date().toISOString().slice(0, 10)): ItemVocabulario[] {
  const r = relatorio(data, hoje);
  const mem = new Map(r.memoria.palavras.map((p) => [p.en.toLowerCase(), p]));
  const doAluno = new Set((data.content?.words ?? []).map((w) => w.id));
  const estudados = new Set(data.history.map((h) => h.ref));
  const vistas = new Set<string>();
  const itens: ItemVocabulario[] = [];
  for (const w of palavrasDe(data)) {
    const k = w.word.trim().toLowerCase();
    const m = mem.get(k);
    if (!k || vistas.has(k) || (!doAluno.has(w.id) && !m)) continue;
    vistas.add(k);
    const ret = m ? Math.round(m.retencao * 100) / 100 : 0;
    itens.push({
      ref: `word:${w.id}`, en: w.word.trim(), pt: w.translations.map((t) => t.text).join(', ') || w.core_meaning,
      classe: w.type || 'palavra', estado: estadoDe(ret, m?.nivel ?? 0, !!m && m.dias > 0), retencao: ret, degrau: m?.nivel ?? 0,
    });
  }
  const outros = (ref: ContentRef, en: string, pt: string, classe: string): ItemVocabulario =>
    ({ ref, en, pt, classe, estado: estudados.has(ref) ? 'estudando' : 'nao_praticada', retencao: 0, degrau: 0 });
  const c = data.content ?? {};
  (c.expressions ?? []).forEach((e) => itens.push(outros(`expression:${e.id}`, e.text, e.translation, 'expressão')));
  return itens.sort((a, b) => a.en.localeCompare(b.en));
}
