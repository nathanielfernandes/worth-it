import { guessCurrency, isCurrency } from './currency';

export type Period = 'hour' | 'week' | 'biweek' | 'semimonth' | 'month' | 'year';
export const SALARY_PERIODS = ['week', 'biweek', 'semimonth', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const PERIODS_PER_YEAR: Record<SalaryPeriod, number> = {
  week: 52,
  biweek: 26,
  semimonth: 24,
  month: 12,
  year: 1,
};

/** Periods offered for "it varies" paychecks. */
export const PAYCHECK_PERIODS = ['week', 'biweek', 'semimonth', 'month'] as const;
export type PaycheckPeriod = (typeof PAYCHECK_PERIODS)[number];


export interface Paycheck {
  amount: number;
  hours: number;
}

export type RatesMode = 'manual' | 'once' | 'daily';

/** Everything the popup edits. Stored under one key; only the popup writes it. */
export interface Settings {
  enabled: boolean;
  /** Currency the user is paid in. */
  currency: string;
  payMode: 'steady' | 'varies';
  /** Steady mode: pay per `period`. */
  amount: number;
  period: Period;
  /** Whether entered amounts are take-home (net) or before tax (gross). */
  basis: 'net' | 'gross';
  /** Share of gross pay kept after tax, 1–100. Used when basis is gross. */
  takeHomePct: number;
  /** Steady mode: hours worked per `hoursPer`. */
  hours: number;
  hoursPer: 'week' | 'period';
  /** Varies mode: recent paychecks, averaged by total pay / total hours. */
  paychecks: Paycheck[];
  /** Varies mode: how often those paychecks come. Separate from `period` so switching modes loses nothing. */
  paycheckPeriod: PaycheckPeriod;
  daysPerWeek: number;
  weeksPerYear: number;
  /** Show inline badges next to prices, in addition to the hover card. */
  inline: boolean;
  /** What the card shows: time of work, what the price would grow to if invested, or both. */
  show: 'time' | 'growth' | 'both';
  /** Which single number badges show when `show` is "both". */
  badgeShows: 'time' | 'growth';
  /** Annual return used for growth, in percent. */
  growthRate: number;
  /** Years the price would be invested for. */
  growthYears: number;
  /** Compound yearly (true) or simple interest (false). */
  compound: boolean;
  ratesMode: RatesMode;
  /** Manual exchange rates keyed "FROM>TO": value of 1 FROM in TO. */
  manualRates: Record<string, number>;
}

/** Rates fetched from Frankfurter. `rates[X]` = units of X per 1 `base`. Written only by the background worker. */
export interface SyncedRates {
  base: string;
  date: string;
  fetchedAt: number;
  rates: Record<string, number>;
}

export const KEYS = {
  settings: 'settings',
  disabledSites: 'disabledSites',
  rates: 'rates',
} as const;

export function defaultSettings(locale = navigator.language): Settings {
  return {
    enabled: true,
    currency: guessCurrency(locale),
    payMode: 'steady',
    amount: 0,
    period: 'biweek',
    basis: 'net',
    takeHomePct: 75,
    hours: 40,
    hoursPer: 'week',
    paychecks: [{ amount: 0, hours: 0 }],
    paycheckPeriod: 'biweek',
    daysPerWeek: 5,
    weeksPerYear: 52,
    inline: false,
    show: 'time',
    badgeShows: 'time',
    growthRate: 7,
    growthYears: 20,
    compound: true,
    ratesMode: 'manual',
    manualRates: {},
  };
}

const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

/** Coerce anything read from storage into a valid Settings object. */
export function normalizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const paychecks = Array.isArray(r.paychecks)
    ? r.paychecks
        .filter((p): p is Paycheck => !!p && typeof p === 'object')
        .map((p) => ({ amount: num(p.amount, 0, 0, 1e9), hours: num(p.hours, 0, 0, 1e5) }))
    : d.paychecks;
  const manualRates: Record<string, number> = {};
  if (r.manualRates && typeof r.manualRates === 'object') {
    for (const [pair, value] of Object.entries(r.manualRates)) {
      const [from, to] = pair.split('>');
      if (isCurrency(from) && isCurrency(to) && typeof value === 'number' && value > 0) manualRates[pair] = value;
    }
  }
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    currency: isCurrency(r.currency) ? r.currency : d.currency,
    payMode: oneOf(r.payMode, ['steady', 'varies'], d.payMode),
    amount: num(r.amount, d.amount, 0, 1e9),
    period: oneOf(r.period, ['hour', ...SALARY_PERIODS], d.period),
    basis: oneOf(r.basis, ['net', 'gross'], d.basis),
    takeHomePct: num(r.takeHomePct, d.takeHomePct, 1, 100),
    hours: num(r.hours, d.hours, 0, 1e5),
    hoursPer: oneOf(r.hoursPer, ['week', 'period'], d.hoursPer),
    paychecks: paychecks.length ? paychecks : d.paychecks,
    paycheckPeriod: oneOf(r.paycheckPeriod, PAYCHECK_PERIODS, d.paycheckPeriod),
    daysPerWeek: num(r.daysPerWeek, d.daysPerWeek, 1, 7),
    weeksPerYear: num(r.weeksPerYear, d.weeksPerYear, 1, 52),
    inline: typeof r.inline === 'boolean' ? r.inline : d.inline,
    show: oneOf(r.show, ['time', 'growth', 'both'], d.show),
    badgeShows: oneOf(r.badgeShows, ['time', 'growth'], d.badgeShows),
    growthRate: num(r.growthRate, d.growthRate, 0, 100),
    growthYears: num(r.growthYears, d.growthYears, 1, 80),
    compound: typeof r.compound === 'boolean' ? r.compound : d.compound,
    ratesMode: oneOf(r.ratesMode, ['manual', 'once', 'daily'], d.ratesMode),
    manualRates,
  };
}

export function normalizeRates(raw: unknown): SyncedRates | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SyncedRates>;
  if (!isCurrency(r.base) || typeof r.date !== 'string' || typeof r.fetchedAt !== 'number') return null;
  if (!r.rates || typeof r.rates !== 'object') return null;
  return { base: r.base, date: r.date, fetchedAt: r.fetchedAt, rates: r.rates };
}

export interface Stored {
  settings: Settings;
  disabledSites: string[];
  rates: SyncedRates | null;
}

export async function loadAll(): Promise<Stored> {
  const got = await chrome.storage.local.get([KEYS.settings, KEYS.disabledSites, KEYS.rates]);
  const sites = got[KEYS.disabledSites];
  return {
    settings: normalizeSettings(got[KEYS.settings]),
    disabledSites: Array.isArray(sites) ? sites.filter((s): s is string => typeof s === 'string') : [],
    rates: normalizeRates(got[KEYS.rates]),
  };
}

export async function toggleSite(host: string): Promise<boolean> {
  const { disabledSites } = await loadAll();
  const disabled = disabledSites.includes(host);
  const next = disabled ? disabledSites.filter((h) => h !== host) : [...disabledSites, host];
  await chrome.storage.local.set({ [KEYS.disabledSites]: next });
  return disabled; // true → now enabled
}
