/** Currencies the extension understands. All are valid Frankfurter quote codes. */
export const CURRENCIES = [
  'AED', 'ARS', 'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK', 'DKK', 'EGP', 'EUR',
  'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NGN', 'NOK', 'NZD',
  'PHP', 'PKR', 'PLN', 'RON', 'RUB', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'USD', 'VND',
  'ZAR',
] as const;

const KNOWN = new Set<string>(CURRENCIES);
export const isCurrency = (code: unknown): code is string => typeof code === 'string' && KNOWN.has(code);

/** ISO 3166 region → currency, for locale and TLD hints. */
export const REGION_CURRENCY: Record<string, string> = {
  AE: 'AED', AR: 'ARS', AT: 'EUR', AU: 'AUD', BE: 'EUR', BG: 'BGN', BR: 'BRL', CA: 'CAD', CH: 'CHF',
  CL: 'CLP', CN: 'CNY', CO: 'COP', CY: 'EUR', CZ: 'CZK', DE: 'EUR', DK: 'DKK', EE: 'EUR', EG: 'EGP',
  ES: 'EUR', FI: 'EUR', FR: 'EUR', GB: 'GBP', GR: 'EUR', HK: 'HKD', HR: 'EUR', HU: 'HUF', ID: 'IDR',
  IE: 'EUR', IL: 'ILS', IN: 'INR', IS: 'ISK', IT: 'EUR', JP: 'JPY', KR: 'KRW', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MT: 'EUR', MX: 'MXN', MY: 'MYR', NG: 'NGN', NL: 'EUR', NO: 'NOK', NZ: 'NZD', PH: 'PHP',
  PK: 'PKR', PL: 'PLN', PT: 'EUR', RO: 'RON', RU: 'RUB', SA: 'SAR', SE: 'SEK', SG: 'SGD', SI: 'EUR',
  SK: 'EUR', TH: 'THB', TR: 'TRY', TW: 'TWD', UA: 'UAH', UK: 'GBP', US: 'USD', VN: 'VND', ZA: 'ZAR',
};

/** Best guess at the user's currency from their browser locale. */
export function guessCurrency(locale: string): string {
  try {
    const region = new Intl.Locale(locale).maximize().region;
    const code = region ? REGION_CURRENCY[region] : undefined;
    if (code) return code;
  } catch {
    // Malformed locale; fall through.
  }
  return 'USD';
}

const moneyFormats = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number, currency: string): string {
  let fmt = moneyFormats.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    moneyFormats.set(currency, fmt);
  }
  return fmt.format(amount);
}

/** Narrow symbol for a currency, e.g. "$" for USD/CAD, "€" for EUR. */
export function currencySymbol(currency: string): string {
  const part = new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency;
}

export function currencyName(currency: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}
