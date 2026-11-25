import { CURRENCIES } from './currency';
import type { SyncedRates } from './settings';

/** Requested via optional_host_permissions only when the user opts into syncing. */
export const RATES_ORIGIN = 'https://api.frankfurter.dev/*';

interface Quote {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

export type RatesReply = { ok: true; rates: SyncedRates } | { ok: false; error: string };

/** Fetch daily reference rates. The only data sent is the base currency code. */
export async function fetchRates(base: string): Promise<SyncedRates> {
  const quotes = CURRENCIES.filter((c) => c !== base).join(',');
  const res = await fetch(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quotes}`, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Rate service answered ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error('Unexpected response from rate service');

  const rates: Record<string, number> = {};
  let date = '';
  for (const q of body as Quote[]) {
    if (q.base !== base || typeof q.rate !== 'number' || !(q.rate > 0)) continue;
    rates[q.quote] = q.rate;
    if (q.date > date) date = q.date;
  }
  if (!Object.keys(rates).length) throw new Error('Rate service returned no rates');
  return { base, date, fetchedAt: Date.now(), rates };
}
