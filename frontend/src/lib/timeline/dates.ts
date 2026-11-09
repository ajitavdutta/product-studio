/**
 * ISO calendar dates <-> integer day numbers (days since the Unix epoch, UTC).
 * Working in UTC days keeps the maths free of DST and timezone drift (ADR-3).
 */

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day number for an ISO date (`YYYY-MM-DD`). Throws on anything else. */
export function toDay(iso: string): number {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Not an ISO date: ${iso}`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / MS_PER_DAY;
}

/** ISO date for a whole day number. */
export function fromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The ISO date `days` days after `iso` (negative goes back). */
export function addDays(iso: string, days: number): string {
  return fromDay(toDay(iso) + days);
}

/** The local calendar date of `now` as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
