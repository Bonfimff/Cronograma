/**
 * Modelos de dados compartilhados.
 * Esta pasta (src/core) não depende de React nem do DOM (exceto o scanner, que recebe
 * um ImageData genérico) — pode ser reaproveitada numa futura versão Android
 * (Capacitor ou React Native) sem reescrita.
 */

// ---------- Conteúdo (arquivos JSON em /content) ----------

/** Referência tipada a qualquer item de conteúdo: "word:how", "pattern:how-are-subject"... */
export type ContentKind = 'word' | 'expression' | 'pattern' | 'grammar' | 'topic';
export type ContentRef = `${ContentKind}:${string}`;

/** Bloco marcado como ✎ COPIE — vai para a folha física. */
export interface CopyBlock {
  lines: string[];
}

export interface Translation {
  text: string;
  context?: string;
}

export interface WordUse {
  id: string;
  label: string; // ex.: "estado", "maneira", "quantidade"
  meaning: string;
  explanation: string;
  examples: string[]; // ids de examples.json
}

export interface Variation {
  form: string; // ex.: "how much"
  meaning: string;
  note?: string;
  ref?: ContentRef;
}

export interface Word {
  id: string;
  word: string;
  type: string; // "question word", "verb"...
  translations: Translation[];
  core_meaning: string;
  uses: WordUse[];
  variations: Variation[];
  related_words: string[];
  examples: string[];
  pronunciation: { ipa: string; respelling?: string };
  audio?: string; // URL de arquivo; se ausente, usa síntese de voz
  copy?: CopyBlock;
}

export interface Expression {
  id: string;
  text: string;
  words: string[]; // ids de words
  translation: string;
  context: string;
  meaning: string;
  pattern?: string; // id de pattern
  examples: string[];
  copy?: CopyBlock;
}

export interface Pattern {
  id: string;
  name: string;
  formula: string; // "How + are + subject?"
  slots: { name: string; options: string[] }[];
  explanation: string;
  examples: string[];
  copy?: CopyBlock;
}

export interface Grammar {
  id: string;
  title: string;
  explanation: string;
  points: string[];
  examples: string[];
  copy?: CopyBlock;
}

export interface Example {
  id: string;
  en: string;
  pt: string;
  context?: string;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  objective: string;
  refs: ContentRef[];
}

export type ExerciseType = 'translate' | 'fill' | 'choice' | 'match' | 'build' | 'qa' | 'produce';

export interface Exercise {
  id: string;
  type: ExerciseType;
  prompt: string;
  answer?: string | string[]; // aceita várias respostas
  options?: string[];
  pairs?: [string, string][];
  tokens?: string[];
  refs: ContentRef[];
  generated?: boolean;
}

export interface ContentBundle {
  words: Word[];
  expressions: Expression[];
  patterns: Pattern[];
  grammar: Grammar[];
  examples: Example[];
  topics: Topic[];
  exercises: Exercise[];
}

// ---------- Dados do usuário (armazenamento local) ----------

export type SessionKind = 'new' | 'practice' | 'review' | 'reinforce' | 'consolidate';
export type SessionStatus = 'planned' | 'in_progress' | 'done';
export type MasteryStatus = 'absorbed' | 'review' | 'reinforce';
export type UsageStatus = 'yes' | 'hard' | 'no';
export type UnderstoodStatus = 'yes' | 'partial' | 'no';

export interface SessionResult {
  durationMin: number;
  exercises: { total: number; correct: number };
  mastery: MasteryStatus;
  usage?: UsageStatus;
  understood?: UnderstoodStatus;
  note?: string;
  source: 'scan' | 'manual';
}

export interface Session {
  id: string; // ENG-2026-0001 (mesmo código da folha)
  date: string; // YYYY-MM-DD
  weekStart: string; // segunda-feira da semana
  kind: SessionKind;
  topicId?: string;
  title: string;
  objective: string;
  refs: ContentRef[]; // conteúdos da sessão
  copyRefs: ContentRef[]; // itens ✎ COPIE que vão para a folha
  whenToUse?: string; // resumo "Quando usar?" da folha (vazio = automático)
  sheet?: SessionSheet; // o que vai para a folha física (vazio = automático)
  app?: SessionApp; // o que fica só no aplicativo
  exerciseIds?: string[]; // exercícios escolhidos (além dos gerados)
  expected?: ExpectedResult; // o que o aluno deve conseguir fazer ao final
  status: SessionStatus;
  startedAt?: string;
  finishedAt?: string;
  result?: SessionResult;
  createdAt: string;
}

/** Conteúdo da folha física. */
export interface SessionSheet {
  copy?: string[]; // Conceito principal ✎ COPIE (até 3 linhas)
  quiz?: string[]; // Tente sem consultar (até 6 itens)
  practice?: string; // instrução da produção escrita (Minha prática)
}

/** Conteúdo que só existe no aplicativo. */
export interface SessionApp {
  intro?: string; // explicação/contexto extra no início da aula
  context?: string; // situação real de uso
  tips?: string[];
}

/** Resultado esperado do aluno ao fim da sessão. */
export interface ExpectedResult {
  result: string; // ex.: "Perguntar e responder como alguém está"
  criteria?: string[]; // ex.: ["Usa How + be + sujeito", "Responde com I am..."]
}

export interface DayPlan {
  date: string;
  theme: string;
  objective: string;
  minutes?: number; // tempo planejado (folha semanal)
}

export interface Week {
  id: string; // = weekStart
  goals: string;
  days: DayPlan[];
}

export interface Worksheet {
  id: string; // ENG-2026-0001 — conteúdo do QR Code
  templateId: string;
  sessionId: string | null;
  createdAt: string;
  printedAt?: string;
}

export type HistoryEvent =
  | 'new'
  | 'practiced'
  | 'reviewed'
  | 'review_needed'
  | 'reinforce_needed'
  | 'consolidated';

export interface HistoryEntry {
  id: string;
  ref: ContentRef;
  date: string;
  event: HistoryEvent;
  sessionId: string;
}

export interface UserData {
  version: 1;
  counter: Record<string, number>; // por ano
  weeks: Week[];
  sessions: Session[];
  worksheets: Worksheet[];
  history: HistoryEntry[];
  /** Conteúdo criado/importado pelo usuário (soma-se ao de /content; mesmo id substitui). */
  content?: Partial<ContentBundle>;
}
