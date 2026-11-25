import { PERIODS_PER_YEAR, type Settings, type SyncedRates } from './settings';

export interface WorkRate {
  /** Take-home pay per hour worked, in the user's currency. */
  hourly: number;
  hoursPerDay: number;
  hoursPerWeek: number;
  hoursPerYear: number;
}

/** Reduce any pay setup to take-home pay per hour worked. Null until the inputs make sense. */
export function workRate(s: Settings): WorkRate | null {
  const keep = s.basis === 'net' ? 1 : s.takeHomePct / 100;
  let hourly: number;
  let hoursPerWeek: number;

  if (s.payMode === 'varies') {
    const ppy = PERIODS_PER_YEAR[s.paycheckPeriod];
    const checks = s.paychecks.filter((p) => p.amount > 0 && p.hours > 0);
    if (!checks.length) return null;
    const pay = checks.reduce((sum, p) => sum + p.amount, 0);
    const hours = checks.reduce((sum, p) => sum + p.hours, 0);
    hourly = (pay * keep) / hours;
    hoursPerWeek = ((hours / checks.length) * ppy) / s.weeksPerYear;
  } else if (s.period === 'hour') {
    if (s.amount <= 0 || s.hours <= 0) return null;
    hourly = s.amount * keep;
    hoursPerWeek = s.hours;
  } else {
    if (s.amount <= 0 || s.hours <= 0) return null;
    const ppy = PERIODS_PER_YEAR[s.period];
    hoursPerWeek = s.hoursPer === 'week' ? s.hours : (s.hours * ppy) / s.weeksPerYear;
    hourly = (s.amount * keep * ppy) / (hoursPerWeek * s.weeksPerYear);
  }

  if (!Number.isFinite(hourly) || hourly <= 0 || !Number.isFinite(hoursPerWeek) || hoursPerWeek <= 0) return null;
  return {
    hourly,
    hoursPerDay: hoursPerWeek / s.daysPerWeek,
    hoursPerWeek,
    hoursPerYear: hoursPerWeek * s.weeksPerYear,
  };
}

/** Value of 1 `from` in `to`, or null when no rate is known. Manual rates win over synced ones. */
export function exchangeRate(from: string, to: string, s: Settings, synced: SyncedRates | null): number | null {
  if (from === to) return 1;
  const direct = s.manualRates[`${from}>${to}`];
  if (direct) return direct;
  const inverse = s.manualRates[`${to}>${from}`];
  if (inverse) return 1 / inverse;
  if (s.ratesMode === 'manual' || !synced) return null;
  const quote = (code: string) => (code === synced.base ? 1 : synced.rates[code]);
  const f = quote(from);
  const t = quote(to);
  return f && t ? t / f : null;
}

export type Unit = 'sec' | 'min' | 'hr' | 'day' | 'week' | 'year';

export interface Span {
  value: number;
  unit: Unit;
}

/**
 * Express `hours` of work in the largest unit that reads well. Days and weeks kick in at 1.5 so
 * "8.3 hours" doesn't collapse to "1 workday"; years kick in at 1 ("1 work year", not "52 work weeks").
 */
export function toSpan(hours: number, r: WorkRate): Span {
  const units: [Unit, number, number][] = [
    ['year', r.hoursPerYear, 1],
    ['week', r.hoursPerWeek, 1.5],
    ['day', r.hoursPerDay, 1.5],
    ['hr', 1, 1],
    ['min', 1 / 60, 1],
  ];
  for (const [unit, size, min] of units) {
    const raw = hours / size;
    // Whole minutes; one decimal below 10 for larger units ("8.3 hours", "12 hours").
    const value = unit === 'min' || raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
    if (value >= min) return { value, unit };
  }
  return { value: Math.round(hours * 3600), unit: 'sec' };
}

const LONG: Record<Unit, [string, string]> = {
  sec: ['second', 'seconds'],
  min: ['minute', 'minutes'],
  hr: ['hour', 'hours'],
  day: ['workday', 'workdays'],
  week: ['work week', 'work weeks'],
  year: ['work year', 'work years'],
};

const SHORT: Record<Unit, string> = { sec: 's', min: 'm', hr: 'h', day: 'd', week: 'w', year: 'y' };

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

/** "42 minutes", "8.3 hours", "1 workday", "2.5 work weeks". */
export function longLabel(s: Span): string {
  if (s.unit === 'sec' && s.value < 1) return 'under a second';
  const [one, many] = LONG[s.unit];
  return `${numberFormat.format(s.value)} ${s.value === 1 ? one : many}`;
}

/** Compact badge text: "42m", "8.3h", "2.5d". */
export function shortLabel(s: Span): string {
  if (s.unit === 'sec' && s.value < 1) return '<1s';
  const v = s.value >= 1000 ? `${Math.round(s.value / 1000)}k` : numberFormat.format(s.value);
  return `${v}${SHORT[s.unit]}`;
}

/** Range label, sharing the unit when both ends agree: "1.2–2.5 hours". */
export function rangeLabel(a: Span, b: Span): string {
  if (a.unit === b.unit) {
    const [, many] = LONG[a.unit];
    return `${numberFormat.format(a.value)}–${numberFormat.format(b.value)} ${many}`;
  }
  return `${longLabel(a)} – ${longLabel(b)}`;
}
