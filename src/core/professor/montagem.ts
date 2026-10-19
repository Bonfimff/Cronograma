import type { Agendamento, ContentRef, UserData } from '../types';
import type { SyncRecord } from '../api/client';
import { registrosLocais } from '../api/sync';
import { applyPackage, checkPackage, type WeekPackage } from '../planning/weekPackage';
import { CODE_RE } from '../qrcodes/ids';
import { simplificar } from '../content/search';

/**
 * O professor monta a aula na conta do aluno.
 *
 * A aula (montada à mão ou vinda da IA) é um pacote semanal e passa pela mesma
 * conferência e aplicação da importação de semana, feitas numa cópia dos dados do aluno. O que
 * mudou na cópia é o que vai para o servidor; o aparelho do aluno recebe na
 * próxima sincronização.
 */

/** O que o professor pode gravar (o servidor confere a mesma lista). */
const KINDS_DO_PROFESSOR = new Set(['week', 'session', 'content', 'agenda']);

export interface Achado { ref: ContentRef; titulo: string; detalhe: string }

/** Procura no vocabulário do aluno (é nele que a aula vai buscar os conteúdos). */
export function buscarNoAluno(aluno: UserData, termo: string, limite = 12): Achado[] {
  const t = simplificar(termo);
  if (t.length < 2) return [];
  const c = aluno.content ?? {};
  const tem = (...xs: (string | undefined)[]) => xs.some((x) => x && simplificar(x).includes(t));
  return [
    ...(c.words ?? []).filter((w) => tem(w.word, ...(w.translations ?? []).map((x) => x.text)))
      .map((w) => ({ ref: `word:${w.id}` as ContentRef, titulo: w.word, detalhe: (w.translations ?? []).map((x) => x.text).join(', ') })),
    ...(c.expressions ?? []).filter((e) => tem(e.text, e.translation))
      .map((e) => ({ ref: `expression:${e.id}` as ContentRef, titulo: e.text, detalhe: e.translation })),
    ...(c.patterns ?? []).filter((p) => tem(p.formula, p.name))
      .map((p) => ({ ref: `pattern:${p.id}` as ContentRef, titulo: p.formula, detalhe: p.name })),
    ...(c.grammar ?? []).filter((g) => tem(g.title))
      .map((g) => ({ ref: `grammar:${g.id}` as ContentRef, titulo: g.title, detalhe: 'gramática' })),
  ].slice(0, limite);
}

export interface Montagem {
  ok: boolean;
  erros: string[];
  avisos: string[];
  registros: SyncRecord[];
  sessaoId?: string;
}

const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** O contador de códigos não sincroniza: parte do maior código que o aluno já tem. */
function acertarContador(d: UserData): void {
  d.counter = { ...d.counter };
  [...d.sessions.map((s) => s.id), ...d.worksheets.map((w) => w.id)].forEach((id) => {
    const m = id.match(CODE_RE);
    if (m) d.counter[m[1]] = Math.max(d.counter[m[1]] ?? 0, Number(m[2]));
  });
}

/** Só o que mudou entre os dois retratos, no formato de registros do servidor. */
function diferenca(antes: UserData, depois: UserData): SyncRecord[] {
  const chave = (r: SyncRecord) => `${r.kind}/${r.id}`;
  const velhos = new Map(registrosLocais(antes).map((r) => [chave(r), JSON.stringify(r.data)]));
  const novos = registrosLocais(depois);
  const saida = novos.filter((r) => velhos.get(chave(r)) !== JSON.stringify(r.data));
  const ficam = new Set(novos.map(chave));
  registrosLocais(antes).forEach((r) => {
    if (!ficam.has(chave(r))) saida.push({ ...r, data: {}, deleted: true });
  });
  return saida.filter((r) => KINDS_DO_PROFESSOR.has(r.kind));
}

/** Aplica um pacote (aula montada à mão ou semana da IA) numa cópia do aluno e devolve o que mudou. */
export function montarPacote(aluno: UserData, pkg: WeekPackage, opts = { replacePlanned: false }): Montagem {
  const depois = copia(aluno);
  acertarContador(depois);
  const check = checkPackage(depois, pkg, opts);
  if (!check.ok) return { ok: false, erros: check.errors, avisos: check.warnings, registros: [] };
  const r = applyPackage(depois, pkg, opts);
  return { ok: true, erros: [], avisos: check.warnings, registros: diferenca(aluno, depois), sessaoId: r.created[0] ?? r.updated[0] };
}

/** Tira uma aula ainda não iniciada (a iniciada ou feita é do aluno). */
export function removerAula(aluno: UserData, id: string): SyncRecord[] {
  const s = aluno.sessions.find((x) => x.id === id);
  if (!s || s.status !== 'planned') return [];
  return [{ kind: 'session', id, data: {}, deleted: true }];
}

export function novoAgendamento(dados: Omit<Agendamento, 'id' | 'criadoEm'>): Agendamento {
  return { ...dados, id: `ag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, criadoEm: new Date().toISOString() };
}

export const registroDoAgendamento = (a: Agendamento): SyncRecord =>
  ({ kind: 'agenda', id: a.id, data: a as unknown as Record<string, unknown> });

const p2 = (n: number) => String(n).padStart(2, '0');
const local = (t: Date) => `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())}T${p2(t.getHours())}:${p2(t.getMinutes())}`;

/** Horário local agora, no mesmo formato do agendamento. */
export const agoraLocal = () => local(new Date());

export function fimDe(a: Agendamento): string {
  const t = new Date(`${a.inicio}:00`);
  t.setMinutes(t.getMinutes() + a.duracao);
  return local(t);
}

/** Marcações que ainda não terminaram, da mais próxima para a mais distante. */
export function proximasAulas(agenda: Agendamento[] | undefined, agora = agoraLocal()): Agendamento[] {
  return (agenda ?? []).filter((a) => fimDe(a) > agora).sort((a, b) => a.inicio.localeCompare(b.inicio));
}
