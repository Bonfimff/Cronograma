/**
 * Modelos das folhas físicas, descritos como dados.
 *
 * Coordenadas no sistema das páginas de referência enviadas (1024 × 1536 px).
 * A página é impressa em A4 com escala uniforme (mesma proporção da referência), centralizada.
 * O mesmo modelo serve para IMPRIMIR (desenho) e para ESCANEAR (posição das caixas e marcadores).
 *
 * Campos dinâmicos ("field") são preenchidos com os dados da sessão/semana — ver fill.ts.
 */

export const REF_W = 1024;
export const REF_H = 1536;

export type IconName =
  | 'target' | 'calendar' | 'list' | 'book' | 'pencil' | 'bulb' | 'check' | 'doc' | 'bars' | 'star' | 'phone';

export type El =
  | { t: 'text'; x: number; y: number; text: string; size: number; weight?: number; color?: Color; ls?: number; anchor?: 'start' | 'middle' }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: Color; stroke?: Color; r?: number; sw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color?: Color; sw?: number }
  | { t: 'lines'; x: number; y: number; w: number; count: number; step: number; color?: Color }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: Color; text?: string; textColor?: Color; size?: number }
  | { t: 'icon'; name: IconName; x: number; y: number; size: number; color?: Color }
  | { t: 'marker'; kind: MarkerKind; x: number; y: number }
  | { t: 'qr'; x: number; y: number; size: number; page?: 'front' | 'back' }
  | { t: 'box'; group: CheckGroupId; value: string; x: number; y: number; size: number }
  | { t: 'field'; key: string; x: number; y: number; size: number; maxChars?: number; lines?: number; step?: number; color?: Color; weight?: number; anchor?: 'start' | 'middle' };

export type Color = 'ink' | 'teal' | 'muted' | 'line' | 'fill' | 'fill2' | 'border' | 'sage' | 'white';

export type MarkerKind = 'square' | 'l-bl' | 'l-br';
export type CheckGroupId = 'mastery' | 'understood' | 'usage';

/** Tamanho dos marcadores de canto (px de referência). */
export const MARKER = { square: 13, arm: 20, thick: 5 };

export interface CheckGroup { id: CheckGroupId; title: string; options: { value: string; label: string }[] }

export const CHECK_GROUPS: CheckGroup[] = [
  { id: 'mastery', title: 'Status do conteúdo', options: [
    { value: 'absorbed', label: 'Consegui absorver o conteúdo' },
    { value: 'review', label: 'Preciso de revisão' },
    { value: 'reinforce', label: 'Preciso de reforço' },
  ] },
  { id: 'understood', title: 'Entendi?', options: [
    { value: 'yes', label: 'Sim' }, { value: 'partial', label: 'Parcialmente' }, { value: 'no', label: 'Não' },
  ] },
  { id: 'usage', title: 'Consegui utilizar?', options: [
    { value: 'yes', label: 'Sim' }, { value: 'hard', label: 'Com dificuldade' }, { value: 'no', label: 'Não' },
  ] },
];

export type PageKind = 'study-front' | 'study-back' | 'week-plan' | 'guide';

export interface PageTemplate {
  id: PageKind;
  name: string;
  /** Página com QR Code (identifica a folha). */
  hasQR: boolean;
  /** Página com marcadores de canto (leitura das caixas). */
  hasMarkers: boolean;
  elements: El[];
}

// ---------- blocos reutilizados ----------
const markers: El[] = [
  { t: 'marker', kind: 'square', x: 21, y: 21 },
  { t: 'marker', kind: 'square', x: 990, y: 21 },
  { t: 'marker', kind: 'l-bl', x: 20, y: 1478 },
  { t: 'marker', kind: 'l-br', x: 984, y: 1478 },
];

const DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
const DAY_TOPS = [528, 646, 764, 887, 1010, 1133, 1253];

// ---------- Dia de Estudo — frente ----------
const studyFront: El[] = [
  ...markers,
  { t: 'text', x: 57, y: 63, text: 'PLANO DE ESTUDOS', size: 16, ls: 0.28, weight: 500 },
  { t: 'line', x1: 293, y1: 58, x2: 510, y2: 58, color: 'ink', sw: 1.2 },
  { t: 'text', x: 52, y: 134, text: 'Dia de Estudo', size: 66, weight: 700 },
  { t: 'text', x: 57, y: 165, text: 'APRENDER HOJE, FALAR AMANHÃ', size: 13, ls: 0.42, weight: 500 },

  { t: 'text', x: 607, y: 109, text: 'DATA', size: 13, weight: 700, ls: 0.08 },
  { t: 'line', x1: 607, y1: 144, x2: 654, y2: 144, color: 'ink' },
  { t: 'text', x: 658, y: 144, text: '/', size: 24 },
  { t: 'line', x1: 673, y1: 144, x2: 715, y2: 144, color: 'ink' },
  { t: 'text', x: 719, y: 144, text: '/', size: 24 },
  { t: 'line', x1: 735, y1: 144, x2: 803, y2: 144, color: 'ink' },
  { t: 'field', key: 'dateD', x: 630, y: 138, size: 18, anchor: 'middle' },
  { t: 'field', key: 'dateM', x: 694, y: 138, size: 18, anchor: 'middle' },
  { t: 'field', key: 'dateY', x: 769, y: 138, size: 18, anchor: 'middle' },

  { t: 'rect', x: 879, y: 47, w: 107, h: 124, r: 7, stroke: 'border', sw: 1.2 },
  { t: 'qr', x: 902, y: 55, size: 66 },
  { t: 'icon', name: 'phone', x: 893, y: 147, size: 22 },
  { t: 'text', x: 908, y: 138, text: 'ESCANEIE', size: 8.5, ls: 0.06 },
  { t: 'text', x: 908, y: 150, text: 'PARA ACESSAR', size: 8.5, ls: 0.06 },
  { t: 'text', x: 908, y: 162, text: 'O CONTEÚDO', size: 8.5, ls: 0.06 },

  { t: 'rect', x: 41, y: 202, w: 946, h: 92, r: 8, fill: 'fill' },
  { t: 'icon', name: 'target', x: 72, y: 234, size: 30, color: 'teal' },
  { t: 'text', x: 108, y: 234, text: 'TEMA DO DIA', size: 13, ls: 0.16, weight: 500 },
  { t: 'line', x1: 108, y1: 266, x2: 521, y2: 266, color: 'ink' },
  { t: 'field', key: 'theme', x: 110, y: 260, size: 19, maxChars: 38, weight: 600 },
  { t: 'line', x1: 547, y1: 218, x2: 547, y2: 278, color: 'muted' },
  { t: 'icon', name: 'calendar', x: 582, y: 234, size: 28, color: 'teal' },
  { t: 'text', x: 610, y: 237, text: 'SEMANA', size: 13, ls: 0.16, weight: 500 },
  { t: 'line', x1: 610, y1: 272, x2: 660, y2: 272, color: 'ink' },
  { t: 'text', x: 662, y: 272, text: '/', size: 20 },
  { t: 'line', x1: 675, y1: 272, x2: 722, y2: 272, color: 'ink' },
  { t: 'field', key: 'weekD', x: 635, y: 266, size: 17, anchor: 'middle' },
  { t: 'field', key: 'weekM', x: 698, y: 266, size: 17, anchor: 'middle' },
  { t: 'line', x1: 748, y1: 218, x2: 748, y2: 278, color: 'muted' },
  { t: 'icon', name: 'list', x: 783, y: 234, size: 26, color: 'teal' },
  { t: 'text', x: 812, y: 237, text: 'SESSÃO', size: 13, ls: 0.16, weight: 500 },
  { t: 'line', x1: 812, y1: 269, x2: 965, y2: 269, color: 'ink' },
  { t: 'field', key: 'session', x: 814, y: 263, size: 16, weight: 600 },

  { t: 'icon', name: 'book', x: 64, y: 337, size: 34, color: 'ink' },
  { t: 'text', x: 99, y: 342, text: 'CONCEITO PRINCIPAL', size: 17, weight: 700, ls: 0.04 },
  { t: 'rect', x: 321, y: 324, w: 83, h: 26, r: 6, fill: 'fill' },
  { t: 'icon', name: 'pencil', x: 340, y: 337, size: 15, color: 'teal' },
  { t: 'text', x: 354, y: 342, text: 'COPIE', size: 12, weight: 700, ls: 0.06 },
  { t: 'rect', x: 45, y: 364, w: 646, h: 122, r: 7, fill: 'fill2' },
  { t: 'lines', x: 64, y: 395, w: 612, count: 3, step: 31.5, color: 'line' },
  { t: 'field', key: 'concept', x: 66, y: 390, size: 16, lines: 3, step: 31.5, maxChars: 68 },

  { t: 'line', x1: 711, y1: 320, x2: 711, y2: 486, color: 'muted' },
  { t: 'rect', x: 725, y: 318, w: 259, h: 168, r: 8, fill: 'fill' },
  { t: 'icon', name: 'bulb', x: 745, y: 348, size: 28, color: 'teal' },
  { t: 'text', x: 771, y: 349, text: 'QUANDO USAR?', size: 14, weight: 700, ls: 0.06 },
  { t: 'field', key: 'whenToUse', x: 771, y: 388, size: 13.5, lines: 4, step: 22, maxChars: 29, color: 'ink' },

  { t: 'icon', name: 'pencil', x: 63, y: 527, size: 28, color: 'teal' },
  { t: 'text', x: 101, y: 529, text: 'MINHA PRÁTICA', size: 14, weight: 700, ls: 0.06, color: 'teal' },
  { t: 'text', x: 101, y: 548, text: 'Escreva aqui suas próprias frases ou traduções.', size: 11.5, color: 'teal' },
  { t: 'field', key: 'practice', x: 101, y: 569, size: 12, maxChars: 120, weight: 600 },
  { t: 'lines', x: 50, y: 583, w: 929, count: 27, step: 33.65, color: 'line' },
];

// ---------- Dia de Estudo — verso ----------
const quizRow = (n: number, cx: number, x1: number, x2: number, y: number): El[] => [
  { t: 'circle', cx, cy: y - 6, r: 14, fill: 'fill', text: String(n), textColor: 'ink', size: 15 },
  { t: 'line', x1, y1: y, x2, y2: y, color: 'line' },
  { t: 'field', key: `quiz${n}`, x: x1 + 2, y: y - 6, size: 12, maxChars: 44, color: 'muted' },
];

const studyBack: El[] = [
  ...markers,
  { t: 'lines', x: 50, y: 48, w: 929, count: 28, step: 32.63, color: 'line' },

  { t: 'icon', name: 'check', x: 59, y: 986, size: 32, color: 'teal' },
  { t: 'text', x: 95, y: 988, text: 'TENTE SEM CONSULTAR', size: 14.5, weight: 700, ls: 0.06 },
  { t: 'text', x: 95, y: 1010, text: 'Responda antes de ver o conteúdo completo no aplicativo.', size: 12, color: 'teal' },
  ...quizRow(1, 59, 92, 488, 1047),
  ...quizRow(2, 59, 92, 488, 1086),
  ...quizRow(3, 59, 92, 488, 1125),
  { t: 'line', x1: 512, y1: 1028, x2: 512, y2: 1135, color: 'muted' },
  ...quizRow(4, 546, 578, 974, 1047),
  ...quizRow(5, 546, 578, 974, 1086),
  ...quizRow(6, 546, 578, 974, 1125),

  { t: 'rect', x: 37, y: 1161, w: 358, h: 257, r: 7, fill: 'fill' },
  { t: 'icon', name: 'doc', x: 63, y: 1188, size: 26, color: 'teal' },
  { t: 'text', x: 89, y: 1192, text: 'RESUMO DO QUE FOI ESTUDADO', size: 11.5, weight: 700, ls: 0.08 },
  { t: 'lines', x: 54, y: 1225, w: 326, count: 6, step: 33, color: 'line' },

  { t: 'rect', x: 409, y: 1163, w: 251, h: 257, r: 7, stroke: 'border', sw: 1.2 },
  { t: 'icon', name: 'bars', x: 438, y: 1188, size: 26, color: 'teal' },
  { t: 'text', x: 469, y: 1192, text: 'STATUS DO CONTEÚDO', size: 11.5, weight: 700, ls: 0.08 },
  { t: 'box', group: 'mastery', value: 'absorbed', x: 428, y: 1229, size: 22 },
  { t: 'text', x: 469, y: 1237, text: 'Consegui absorver', size: 14 },
  { t: 'text', x: 469, y: 1257, text: 'o conteúdo', size: 14 },
  { t: 'box', group: 'mastery', value: 'review', x: 428, y: 1287, size: 22 },
  { t: 'text', x: 469, y: 1303, text: 'Preciso de revisão', size: 14 },
  { t: 'box', group: 'mastery', value: 'reinforce', x: 428, y: 1342, size: 22 },
  { t: 'text', x: 469, y: 1358, text: 'Preciso de reforço', size: 14 },

  { t: 'rect', x: 674, y: 1163, w: 304, h: 259, r: 7, stroke: 'border', sw: 1.2 },
  { t: 'icon', name: 'star', x: 697, y: 1188, size: 26, color: 'teal' },
  { t: 'text', x: 722, y: 1192, text: 'AO FINAL DO ESTUDO', size: 11.5, weight: 700, ls: 0.08 },
  { t: 'text', x: 689, y: 1224, text: 'Entendi?', size: 12, weight: 700 },
  { t: 'box', group: 'understood', value: 'yes', x: 689, y: 1234, size: 17 },
  { t: 'text', x: 716, y: 1247, text: 'Sim', size: 10 },
  { t: 'box', group: 'understood', value: 'partial', x: 753, y: 1236, size: 13 },
  { t: 'text', x: 773, y: 1247, text: 'Parcialmente', size: 10 },
  { t: 'box', group: 'understood', value: 'no', x: 854, y: 1236, size: 13 },
  { t: 'text', x: 875, y: 1247, text: 'Não', size: 10 },
  { t: 'text', x: 689, y: 1277, text: 'Consegui utilizar?', size: 12, weight: 700 },
  { t: 'box', group: 'usage', value: 'yes', x: 689, y: 1287, size: 17 },
  { t: 'text', x: 716, y: 1300, text: 'Sim', size: 10 },
  { t: 'box', group: 'usage', value: 'hard', x: 752, y: 1289, size: 13 },
  { t: 'text', x: 772, y: 1300, text: 'Com dificuldade', size: 10 },
  { t: 'box', group: 'usage', value: 'no', x: 861, y: 1289, size: 13 },
  { t: 'text', x: 881, y: 1300, text: 'Não', size: 10 },
  { t: 'icon', name: 'pencil', x: 698, y: 1334, size: 22, color: 'teal' },
  { t: 'text', x: 722, y: 1338, text: 'Observação', size: 10.5, weight: 600 },
  { t: 'lines', x: 706, y: 1362, w: 258, count: 3, step: 24.5, color: 'line' },

  { t: 'text', x: 45, y: 1460, text: 'PEQUENOS PASSOS, GRANDES RESULTADOS', size: 10.5, ls: 0.3, color: 'teal' },
  { t: 'line', x1: 358, y1: 1456, x2: 872, y2: 1456, color: 'line' },
  // QR do verso: mesmo código + "/V" → identifica a folha e que esta é a página das caixas
  { t: 'qr', x: 888, y: 1420, size: 68, page: 'back' },
];

// ---------- Plano semanal ----------
const weekPlan: El[] = [
  { t: 'text', x: 60, y: 102, text: 'Plano de Estudos', size: 54, weight: 700 },
  { t: 'line', x1: 515, y1: 83, x2: 747, y2: 83, color: 'muted' },
  { t: 'text', x: 61, y: 146, text: 'CONTEÚDO SEMANAL', size: 27, ls: 0.12, weight: 400 },
  { t: 'text', x: 794, y: 84, text: 'Semana de:', size: 14.5 },
  { t: 'line', x1: 794, y1: 120, x2: 837, y2: 120, color: 'ink' },
  { t: 'text', x: 842, y: 119, text: '/', size: 20 },
  { t: 'line', x1: 857, y1: 120, x2: 891, y2: 120, color: 'ink' },
  { t: 'text', x: 896, y: 119, text: '/', size: 20 },
  { t: 'line', x1: 910, y1: 120, x2: 973, y2: 120, color: 'ink' },
  { t: 'field', key: 'weekD', x: 815, y: 114, size: 17, anchor: 'middle' },
  { t: 'field', key: 'weekM', x: 874, y: 114, size: 17, anchor: 'middle' },
  { t: 'field', key: 'weekY', x: 941, y: 114, size: 17, anchor: 'middle' },

  { t: 'rect', x: 43, y: 188, w: 940, h: 271, r: 6, stroke: 'border', sw: 1.2 },
  { t: 'rect', x: 44, y: 189, w: 938, h: 51, r: 6, fill: 'fill' },
  { t: 'text', x: 64, y: 223, text: 'Conteúdo da semana', size: 23, weight: 600 },
  { t: 'rect', x: 64, y: 262, w: 33, h: 33, r: 4, stroke: 'ink', sw: 1.4 },
  { t: 'text', x: 115, y: 277, text: 'Novos conceitos', size: 16.5, weight: 600, color: 'muted' },
  { t: 'text', x: 115, y: 299, text: 'e aprendizados', size: 16.5, weight: 600, color: 'muted' },
  { t: 'line', x1: 360, y1: 262, x2: 360, y2: 439, color: 'border' },
  { t: 'rect', x: 383, y: 262, w: 33, h: 33, r: 4, stroke: 'ink', sw: 1.4 },
  { t: 'text', x: 437, y: 280, text: 'Revisão', size: 16.5, weight: 600, color: 'muted' },
  { t: 'line', x1: 687, y1: 262, x2: 687, y2: 439, color: 'border' },
  { t: 'rect', x: 717, y: 262, w: 33, h: 33, r: 4, stroke: 'ink', sw: 1.4 },
  { t: 'text', x: 770, y: 280, text: 'Prática', size: 16.5, weight: 600, color: 'muted' },
  { t: 'lines', x: 64, y: 333, w: 273, count: 4, step: 32, color: 'line' },
  { t: 'lines', x: 383, y: 333, w: 282, count: 4, step: 32, color: 'line' },
  { t: 'lines', x: 716, y: 333, w: 248, count: 4, step: 32, color: 'line' },
  { t: 'field', key: 'colNew', x: 66, y: 328, size: 13, lines: 4, step: 32, maxChars: 38 },
  { t: 'field', key: 'colReview', x: 385, y: 328, size: 13, lines: 4, step: 32, maxChars: 39 },
  { t: 'field', key: 'colPractice', x: 718, y: 328, size: 13, lines: 4, step: 32, maxChars: 34 },

  { t: 'text', x: 45, y: 507, text: 'Planejamento da semana', size: 21, weight: 600 },
  ...DAY_TOPS.flatMap((top, i): El[] => [
    { t: 'rect', x: 43, y: top, w: 940, h: 104, r: 5, stroke: 'border', sw: 1.2 },
    { t: 'rect', x: 44, y: top + 1, w: 132, h: 102, r: 5, fill: 'fill' },
    { t: 'text', x: 110, y: top + 46, text: DAYS[i], size: 19, weight: 700, anchor: 'middle' },
    { t: 'field', key: `day${i}Date`, x: 110, y: top + 72, size: 13, anchor: 'middle', color: 'muted' },
    { t: 'text', x: 194, y: top + 30, text: 'O que será estudado:', size: 14.5 },
    { t: 'field', key: `day${i}Text`, x: 194, y: top + 58, size: 14, lines: 2, step: 24, maxChars: 76 },
    { t: 'line', x1: 804, y1: top + 20, x2: 804, y2: top + 88, color: 'border' },
    { t: 'text', x: 824, y: top + 32, text: 'Tempo:', size: 14.5 },
    { t: 'line', x1: 828, y1: top + 77, x2: 873, y2: top + 77, color: 'ink' },
    { t: 'field', key: `day${i}Min`, x: 850, y: top + 71, size: 15, anchor: 'middle' },
    { t: 'text', x: 883, y: top + 76, text: 'min', size: 14.5 },
  ]),
  { t: 'rect', x: 43, y: 1373, w: 940, h: 120, r: 6, fill: 'fill' },
  { t: 'text', x: 66, y: 1400, text: 'Observações', size: 16, weight: 700 },
  { t: 'lines', x: 66, y: 1426, w: 892, count: 3, step: 22, color: 'line' },
  { t: 'field', key: 'notes', x: 68, y: 1422, size: 13, lines: 3, step: 22, maxChars: 130 },
];

// ---------- Orientações (página fixa) ----------
const GUIDE = [
  ['Revisão semanal', 'Organizar e revisar, uma vez por semana,', 'os conteúdos aprendidos durante a semana.'],
  ['Separação dos conteúdos', 'Diferenciar novos conceitos,', 'revisão e prática.'],
  ['Tempo mínimo', 'Estudar pelo menos 20 minutos por dia,', 'preferencialmente de forma contínua.'],
  ['Registro', 'Registrar brevemente o que foi estudado', 'em cada sessão.'],
  ['Objetivo da sessão', 'Definir um objetivo simples', 'para cada estudo.'],
  ['Reforço', 'Retomar conteúdos que ainda', 'apresentem dificuldade.'],
];
const GUIDE_Y = [348, 516, 696, 874, 1052, 1229];

const guide: El[] = [
  { t: 'text', x: 90, y: 132, text: 'Plano de Estudos', size: 62, weight: 700 },
  { t: 'text', x: 92, y: 195, text: 'e Organização Semanal', size: 45, weight: 400 },
  { t: 'rect', x: 92, y: 236, w: 108, h: 5, r: 2, fill: 'sage' },
  ...GUIDE.flatMap(([title, a, b], i): El[] => [
    { t: 'circle', cx: 134, cy: GUIDE_Y[i], r: 43, fill: 'sage', text: String(i + 1), textColor: 'white', size: 40 },
    { t: 'text', x: 233, y: GUIDE_Y[i] - 16, text: title, size: 27, weight: 700 },
    { t: 'text', x: 233, y: GUIDE_Y[i] + 22, text: a, size: 21.5 },
    { t: 'text', x: 233, y: GUIDE_Y[i] + 58, text: b, size: 21.5 },
    ...(i < 5 ? [{ t: 'line', x1: 92, y1: GUIDE_Y[i] + 95, x2: 935, y2: GUIDE_Y[i] + 95, color: 'border' } as El] : []),
  ]),
  { t: 'rect', x: 83, y: 1333, w: 858, h: 137, r: 8, fill: 'fill' },
  { t: 'icon', name: 'target', x: 195, y: 1398, size: 66, color: 'sage' },
  { t: 'line', x1: 270, y1: 1360, x2: 270, y2: 1442, color: 'muted' },
  { t: 'text', x: 312, y: 1375, text: 'Diretriz', size: 21, weight: 700 },
  { t: 'text', x: 312, y: 1412, text: 'Aprender, praticar, revisar e consolidar —', size: 19.5 },
  { t: 'text', x: 312, y: 1447, text: 'sem acumular conteúdo sem revisar.', size: 19.5 },
];

export const PAGES: Record<PageKind, PageTemplate> = {
  'study-front': { id: 'study-front', name: 'Dia de Estudo — frente', hasQR: true, hasMarkers: true, elements: studyFront },
  'study-back': { id: 'study-back', name: 'Dia de Estudo — verso', hasQR: true, hasMarkers: true, elements: studyBack },
  'week-plan': { id: 'week-plan', name: 'Plano de Estudos — semanal', hasQR: false, hasMarkers: false, elements: weekPlan },
  guide: { id: 'guide', name: 'Plano de Estudos — orientações', hasQR: false, hasMarkers: false, elements: guide },
};

/** Folha de estudo = frente + verso. */
export const DEFAULT_TEMPLATE_ID = 'dia-de-estudo';
export const STUDY_PAGES: PageKind[] = ['study-front', 'study-back'];

/** Ponto de referência (centroide) de cada marcador, em px de referência. */
export function markerCentroid(kind: MarkerKind, x: number, y: number): { x: number; y: number } {
  const { square, arm, thick } = MARKER;
  if (kind === 'square') return { x: x + square / 2, y: y + square / 2 };
  // L = barra vertical (thick × arm) + barra horizontal (arm-thick × thick)
  const aV = thick * arm, aH = (arm - thick) * thick;
  const vx = kind === 'l-bl' ? x + thick / 2 : x + arm - thick / 2;
  const hx = kind === 'l-bl' ? x + thick + (arm - thick) / 2 : x + (arm - thick) / 2;
  const vy = y + arm / 2, hy = y + arm - thick / 2;
  return { x: (vx * aV + hx * aH) / (aV + aH), y: (vy * aV + hy * aH) / (aV + aH) };
}

export function boxesOf(page: PageTemplate) {
  return page.elements.filter((e): e is Extract<El, { t: 'box' }> => e.t === 'box');
}
