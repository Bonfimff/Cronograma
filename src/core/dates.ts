/** Datas sempre como string local YYYY-MM-DD (sem fuso). */

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const today = () => toISO(new Date());

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Segunda-feira da semana da data. */
export function weekStartOf(iso: string): string {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return addDays(iso, -dow);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const weekdayName = (iso: string) => WEEKDAYS[fromISO(iso).getDay()];
export const weekdayShort = (iso: string) => weekdayName(iso).slice(0, 3);

export function fmtShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
