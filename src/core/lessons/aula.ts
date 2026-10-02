/**
 * A aula em cartões: uma ideia por tela, no ritmo da pessoa.
 *
 * A ordem segue o que a pesquisa sobre aprendizagem indica (ver docs/aula-em-cartoes.md):
 * abertura com objetivo → aquecimento (tentar antes de aprender) → palavras-chave antes
 * dos conceitos (pré-treino) → cada conceito seguido de uma checagem rápida (prática de
 * recuperação) → escuta → fala (ouvir e repetir) → missão (usar na situação) → fechamento.
 *
 * Aqui só se monta a sequência e o que cada cartão diz em voz alta; a tela fica em
 * AulaPage.tsx. No modo leitura ficam só os cartões de conteúdo, sem exercícios.
 */

import type { ContentRef, Example, Exercise, Expression, Grammar, Pattern, Session, UserData, Word } from '../types';
import { content, copyBlock, examplesFor, getWord, parseRef, refLabel, resolve } from '../content/repository';
import { fromExample, getExerciseList, seeded, shuffle, wordsInSession } from '../exercises/exercises';
import { editDistance, judgeSpeech, normalizeSpoken, similarity, thresholdFor, type Verdict } from '../games/fastSpeech';
import type { Parte } from './vozes';

/** Itens novos por aula: mais que isso sobrecarrega (o resto vai para "Saiba mais"). */
export const MAX_PALAVRAS = 4;
export const MAX_CONCEITOS = 4;

export type Modo = 'estudo' | 'leitura';

interface Base { id: string; rotulo: string }

export interface EtapaAbertura extends Base {
  tipo: 'abertura';
  titulo: string;
  situacao?: string;
  objetivo: string;
  intro?: string;
  itens: string[];
  minutos: number;
}
export interface EtapaPalavra extends Base {
  tipo: 'palavra';
  ref: ContentRef;
  en: string;
  classe: string;
  ipa?: string;
  soletrado?: string;
  traducoes: string[];
  significado: string;
  exemplo?: Example;
  audio?: string;
}
export interface EtapaConceito extends Base {
  tipo: 'conceito';
  ref: ContentRef;
  classe: string;
  /** título em inglês (expressão) ou em português (padrão, gramática) */
  titulo: string;
  tituloEmIngles: boolean;
  formula?: string;
  traducao?: string;
  explicacao: string;
  pontos: string[];
  exemplos: Example[];
}
export interface EtapaExercicio extends Base { tipo: 'aquecimento' | 'pratica'; exercicio: Exercise; dica?: string }
export interface EtapaEscuta extends Base { tipo: 'escuta'; exemplo: Example; opcoes: string[] }
export interface EtapaFala extends Base { tipo: 'fala'; alvo: Example }
export interface EtapaMissao extends Base { tipo: 'missao'; situacao: string; tarefas: Example[] }
export interface EtapaFechamento extends Base {
  tipo: 'fechamento';
  chaves: Example[];
  copia: string[];
  criterios: string[];
  extras: ContentRef[];
}

export type Etapa =
  | EtapaAbertura | EtapaPalavra | EtapaConceito | EtapaExercicio
  | EtapaEscuta | EtapaFala | EtapaMissao | EtapaFechamento;

const curto = (e: Example) => e.en.split(/\s+/).length <= 8;
const unicos = <T,>(xs: T[], chave: (x: T) => string) => {
  const vistos = new Set<string>();
  return xs.filter((x) => { const k = chave(x); if (vistos.has(k)) return false; vistos.add(k); return true; });
};

export function montarAula(data: UserData, s: Session, modo: Modo = 'estudo'): Etapa[] {
  const rnd = seeded(`${s.id}:aula`);
  const palavrasRefs = s.refs.filter((r) => parseRef(r).kind === 'word' && resolve(r));
  const conceitosRefs = s.refs.filter((r) => parseRef(r).kind !== 'word' && resolve(r));
  const palavrasAula = palavrasRefs.slice(0, MAX_PALAVRAS);
  const conceitosAula = conceitosRefs.slice(0, MAX_CONCEITOS);
  const extras = [...palavrasRefs.slice(MAX_PALAVRAS), ...conceitosRefs.slice(MAX_CONCEITOS)];
  const nomesSessao = wordsInSession(s.refs);
  const todosExemplos = unicos(s.refs.flatMap((r) => examplesFor(r)), (e) => e.id);

  const etapas: Etapa[] = [];

  // 1. abertura
  const itens = [...palavrasAula, ...conceitosAula].map(refLabel);
  etapas.push({
    tipo: 'abertura', id: 'abertura', rotulo: 'Abertura',
    titulo: s.title,
    situacao: s.app?.context,
    objetivo: s.expected?.result || s.objective,
    intro: s.app?.intro,
    itens,
    minutos: Math.max(5, Math.round(2 + palavrasAula.length * 1.5 + conceitosAula.length * 2.5 + (modo === 'estudo' ? 4 : 0))),
  });

  // 2. aquecimento: lembrar de uma aula anterior, ou arriscar antes de aprender
  if (modo === 'estudo') {
    const aquece = aquecimento(data, s, todosExemplos, rnd);
    if (aquece) etapas.push(aquece);
  }

  // 3. palavras-chave (pré-treino: os nomes antes das regras)
  palavrasAula.forEach((ref, n) => {
    const w = resolve(ref) as Word;
    etapas.push({
      tipo: 'palavra', id: `palavra-${ref}`, rotulo: `Palavra ${n + 1} de ${palavrasAula.length}`,
      ref, en: w.word, classe: w.type,
      ipa: w.pronunciation?.ipa || undefined,
      soletrado: w.pronunciation?.respelling || undefined,
      traducoes: w.translations.map((t) => (t.context ? `${t.text} (${t.context})` : t.text)),
      significado: w.core_meaning,
      exemplo: examplesFor(ref).find(curto) ?? examplesFor(ref)[0],
      audio: w.audio,
    });
  });

  // 4. conceitos, cada um seguido de uma checagem rápida
  let giro = 1; // começa por montar frase: é a que mais obriga a pensar na ordem das palavras
  conceitosAula.forEach((ref, n) => {
    const conceito = montarConceito(ref, `Conceito ${n + 1} de ${conceitosAula.length}`);
    if (!conceito) return;
    etapas.push(conceito);
    if (modo !== 'estudo') return;
    const base = examplesFor(ref);
    const alvo = base[2] ?? base[0];
    if (!alvo) return;
    const ex = fromExample(alvo, giro++, nomesSessao, rnd, [ref]);
    if (ex) etapas.push({ tipo: 'pratica', id: `pratica-${ref}`, rotulo: 'Checagem rápida', exercicio: ex });
  });

  if (modo === 'estudo') {
    // exercícios escritos para esta sessão (até 2)
    getExerciseList(s.exerciseIds ?? []).slice(0, 2).forEach((ex, n) => {
      etapas.push({ tipo: 'pratica', id: `autoral-${ex.id}`, rotulo: `Revisão rápida ${n + 1}`, exercicio: ex });
    });

    // 5. escuta: ouvir e entender sem ler
    const paraOuvir = shuffle(todosExemplos.filter(curto), rnd).slice(0, 2);
    paraOuvir.forEach((ex, n) => {
      const outros = unicos(
        [...shuffle(todosExemplos, rnd), ...shuffle(content.examples, rnd)].filter((o) => o.pt !== ex.pt),
        (o) => o.pt,
      ).slice(0, 2);
      if (outros.length < 2) return;
      etapas.push({
        tipo: 'escuta', id: `escuta-${ex.id}`, rotulo: `Escuta ${n + 1}`,
        exemplo: ex, opcoes: shuffle([ex.pt, ...outros.map((o) => o.pt)], rnd),
      });
    });

    // 6. fala: ouvir e repetir as frases-chave
    const chaves = frasesChave(conceitosAula, todosExemplos);
    chaves.slice(0, 2).forEach((ex, n) => {
      etapas.push({ tipo: 'fala', id: `fala-${ex.id}`, rotulo: `Fale ${n + 1}`, alvo: ex });
    });

    // 7. missão: usar na situação da aula
    const tarefas = unicos([...chaves, ...todosExemplos.filter(curto)], (e) => e.id).slice(0, 3);
    if (tarefas.length) {
      etapas.push({
        tipo: 'missao', id: 'missao', rotulo: 'Missão',
        situacao: s.app?.context || s.expected?.result || s.objective,
        tarefas,
      });
    }
  }

  // 8. fechamento
  const copia = s.sheet?.copy?.length
    ? s.sheet.copy
    : s.copyRefs.flatMap((r) => copyBlock(r)?.lines ?? []).slice(0, 3);
  etapas.push({
    tipo: 'fechamento', id: 'fechamento', rotulo: 'Fechamento',
    chaves: frasesChave(conceitosAula, todosExemplos).slice(0, 3),
    copia,
    criterios: s.expected?.criteria ?? [],
    extras,
  });
  return etapas;
}

function montarConceito(ref: ContentRef, rotulo: string): EtapaConceito | null {
  const { kind } = parseRef(ref);
  const it = resolve(ref);
  if (!it) return null;
  const exemplos = examplesFor(ref).slice(0, 2);
  if (kind === 'expression') {
    const e = it as Expression;
    return {
      tipo: 'conceito', id: `conceito-${ref}`, rotulo, ref, classe: 'expressão',
      titulo: e.text, tituloEmIngles: true, traducao: e.translation,
      explicacao: [e.meaning, e.context].filter(Boolean).join(' '), pontos: [], exemplos,
    };
  }
  if (kind === 'pattern') {
    const p = it as Pattern;
    return {
      tipo: 'conceito', id: `conceito-${ref}`, rotulo, ref, classe: 'padrão',
      titulo: p.name, tituloEmIngles: false, formula: p.formula,
      explicacao: p.explanation,
      pontos: p.slots.filter((x) => x.options.length).map((x) => `${x.name}: ${x.options.join(' · ')}`).slice(0, 3),
      exemplos,
    };
  }
  if (kind === 'grammar') {
    const g = it as Grammar;
    return {
      tipo: 'conceito', id: `conceito-${ref}`, rotulo, ref, classe: 'gramática',
      titulo: g.title, tituloEmIngles: false, explicacao: g.explanation, pontos: g.points.slice(0, 3), exemplos,
    };
  }
  return null;
}

/** Uma frase de exemplo por conceito: as que a pessoa deve levar da aula. */
function frasesChave(conceitos: ContentRef[], todos: Example[]): Example[] {
  const deConceitos = conceitos.map((r) => examplesFor(r).find(curto)).filter(Boolean) as Example[];
  return unicos([...deConceitos, ...todos.filter(curto)], (e) => e.id);
}

function aquecimento(data: UserData, s: Session, exemplos: Example[], rnd: () => number): EtapaExercicio | null {
  // palavra de uma aula anterior: lembrar antes de começar
  const antes = [...new Set(data.history.filter((h) => h.sessionId !== s.id).map((h) => h.ref))]
    .filter((r) => parseRef(r).kind === 'word' && !s.refs.includes(r))
    .map((r) => getWord(parseRef(r).id))
    .filter(Boolean) as Word[];
  if (antes.length) {
    const w = shuffle(antes, rnd)[0];
    const certo = w.translations[0]?.text;
    const outras = unicos(
      shuffle(content.words.filter((x) => x.id !== w.id), rnd).map((x) => x.translations[0]?.text).filter(Boolean) as string[],
      (x) => x,
    ).filter((x) => x !== certo).slice(0, 2);
    if (certo && outras.length === 2) {
      return {
        tipo: 'aquecimento', id: 'aquecimento', rotulo: 'Aquecimento',
        dica: 'Uma palavra de uma aula anterior. Lembrar sem consultar é o que fixa.',
        exercicio: {
          id: `aq-${w.id}`, type: 'choice', refs: [`word:${w.id}`],
          prompt: `O que significa “${w.word}”?`, options: shuffle([certo, ...outras], rnd), answer: certo,
        },
      };
    }
  }
  // primeira aula: arriscar a frase principal antes de aprender
  if (exemplos.length >= 3) {
    const [alvo, ...resto] = exemplos;
    return {
      tipo: 'aquecimento', id: 'aquecimento', rotulo: 'Aquecimento',
      dica: 'Ainda não aprendeu? Arrisque mesmo assim: errar agora ajuda a lembrar depois.',
      exercicio: {
        id: `aq-${alvo.id}`, type: 'choice', refs: s.refs,
        prompt: `Como você diria “${alvo.pt}”?`,
        options: shuffle([alvo.en, ...resto.slice(0, 2).map((e) => e.en)], rnd), answer: alvo.en,
      },
    };
  }
  return null;
}

// ---------- o que cada cartão diz em voz alta ----------

const pt = (texto?: string): Parte[] => (texto?.trim() ? [{ texto, lingua: 'pt' }] : []);
const en = (texto?: string): Parte[] => (texto?.trim() ? [{ texto, lingua: 'en' }] : []);

const PALAVRAS_EN = /\b(you|are|is|do|does|the|what|where|how|who|why|when|i|am|my|your|to|it|work|name|nice|meet)\b/i;

/** Separa o texto em português dos trechos entre aspas que estão em inglês. */
export function separarLinguas(texto: string): Parte[] {
  const partes: Parte[] = [];
  let resto = texto;
  const aspas = /[“"]([^”"]+)[”"]/;
  for (let m = aspas.exec(resto); m; m = aspas.exec(resto)) {
    partes.push(...pt(resto.slice(0, m.index)));
    const dentro = m[1];
    const ingles = !/[à-úç]/i.test(dentro) && PALAVRAS_EN.test(dentro);
    partes.push(...(ingles ? en(dentro) : pt(dentro)));
    resto = resto.slice(m.index + m[0].length);
  }
  partes.push(...pt(resto));
  return partes;
}

export function falasDaEtapa(e: Etapa): Parte[] {
  switch (e.tipo) {
    case 'abertura':
      return [
        ...pt(e.titulo), ...pt(e.situacao),
        ...pt(`Ao final, você vai conseguir: ${e.objetivo}`), ...pt(e.intro),
      ];
    case 'palavra':
      return [
        ...en(e.en), ...pt(e.traducoes.join(', ')), ...pt(e.significado),
        ...en(e.exemplo?.en), ...pt(e.exemplo?.pt),
      ];
    case 'conceito':
      return [
        ...(e.tituloEmIngles ? en(e.titulo) : pt(e.titulo)), ...pt(e.traducao), ...pt(e.explicacao),
        ...e.exemplos.flatMap((x) => [...en(x.en), ...pt(x.pt)]),
      ];
    case 'aquecimento':
    case 'pratica':
      return separarLinguas(e.exercicio.prompt);
    case 'escuta':
      return [...pt('Ouça e escolha o significado.'), ...en(e.exemplo.en)];
    case 'fala':
      return [...pt('Ouça e repita.'), ...en(e.alvo.en), ...pt(e.alvo.pt)];
    case 'missao':
      return [...pt(e.situacao), ...pt('Diga em inglês o que se pede em cada tarefa.')];
    case 'fechamento':
      return [...pt('Resumo da aula.'), ...e.chaves.flatMap((x) => [...en(x.en), ...pt(x.pt)])];
  }
}

// ---------- correção da fala ----------

export interface FraseJulgada {
  verdict: Verdict;
  /** cada palavra esperada e se foi ouvida */
  palavras: { texto: string; ok: boolean }[];
  ouvido: string;
}

/**
 * Compara o que o reconhecedor ouviu com a frase esperada, palavra por palavra,
 * aceitando pronúncia aproximada (o mesmo critério do Fala-Rápida). Uma palavra
 * sozinha usa o julgamento do jogo.
 */
export function julgarFrase(esperado: string, ouvido: string): FraseJulgada {
  const alvo = normalizeSpoken(esperado).split(' ').filter(Boolean);
  const dito = normalizeSpoken(ouvido).split(' ').filter(Boolean);
  const originais = esperado.replace(/[?.!,;:]/g, '').split(/\s+/).filter(Boolean);
  if (!dito.length) return { verdict: 'unclear', palavras: originais.map((t) => ({ texto: t, ok: false })), ouvido: '' };

  if (alvo.length === 1) {
    const j = judgeSpeech(esperado, [ouvido]);
    return { verdict: j.verdict, palavras: [{ texto: originais[0] ?? esperado, ok: j.verdict === 'ok' || j.verdict === 'close' }], ouvido };
  }

  // alinhamento por maior subsequência comum, com igualdade aproximada
  const igual = (a: string, b: string) => a === b || similarity(a, b) >= thresholdFor(a);
  const n = alvo.length, m = dito.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = igual(alvo[i], dito[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  const ok = new Array(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (igual(alvo[i], dito[j])) { ok[i] = true; i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) i++;
    else j++;
  }
  const acertos = ok.filter(Boolean).length / n;
  // palavras a mais pesam pouco: quem fala devagar repete
  const sobra = Math.max(0, m - n) / Math.max(n, 1);
  const nota = acertos - sobra * 0.15;
  const verdict: Verdict = nota >= 0.85 ? 'ok' : nota >= 0.6 ? 'close' : editDistance(alvo.join(' '), dito.join(' ')) <= 2 ? 'close' : 'bad';
  return {
    verdict,
    palavras: (originais.length === n ? originais : alvo).map((texto, i) => ({ texto, ok: ok[i] })),
    ouvido,
  };
}

// ---------- preferências do player ----------

const AUTO = 'ingles-hibrido:aula-leitura-automatica';

export function lerAutomatico(): boolean {
  try { return localStorage.getItem(AUTO) !== '0'; } catch { return true; }
}

export function guardarAutomatico(v: boolean): void {
  try { localStorage.setItem(AUTO, v ? '1' : '0'); } catch { /* sem armazenamento */ }
}