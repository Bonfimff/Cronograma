import type { DiaSemana, Disponibilidade, Periodo } from '../types';

/** Os dias na ordem da semana do app (começa na segunda), com o número do getDay(). */
export const DIAS: { d: DiaSemana; nome: string; curto: string; js: number }[] = [
  { d: 'seg', nome: 'Segunda', curto: 'seg', js: 1 }, { d: 'ter', nome: 'Terça', curto: 'ter', js: 2 },
  { d: 'qua', nome: 'Quarta', curto: 'qua', js: 3 }, { d: 'qui', nome: 'Quinta', curto: 'qui', js: 4 },
  { d: 'sex', nome: 'Sexta', curto: 'sex', js: 5 }, { d: 'sab', nome: 'Sábado', curto: 'sáb', js: 6 },
  { d: 'dom', nome: 'Domingo', curto: 'dom', js: 0 },
];

export const PERIODOS: { p: Periodo; nome: string; faixa: string }[] = [
  { p: 'manha', nome: 'Manhã', faixa: '6h às 12h' },
  { p: 'tarde', nome: 'Tarde', faixa: '12h às 18h' },
  { p: 'noite', nome: 'Noite', faixa: '18h às 23h' },
];

/** Os períodos livres numa data (YYYY-MM-DD). */
export function livreEm(disp: Disponibilidade | undefined, data: string): Periodo[] {
  const js = new Date(`${data}T00:00`).getDay();
  const dia = DIAS.find((x) => x.js === js)!.d;
  return disp?.dias[dia] ?? [];
}

/** O período em que cai uma hora "HH:mm". */
export function periodoDa(hora: string): Periodo {
  const h = Number(hora.slice(0, 2));
  return h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite';
}

/** "Segunda: noite · Sábado: manhã e tarde" */
export function resumo(disp: Disponibilidade | undefined): string {
  const nomeP = (p: Periodo) => PERIODOS.find((x) => x.p === p)!.nome.toLowerCase();
  return DIAS.filter((x) => disp?.dias[x.d]?.length)
    .map((x) => `${x.nome}: ${disp!.dias[x.d]!.map(nomeP).join(' e ')}`).join(' · ');
}
