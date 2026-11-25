/** Symbols that several currencies share; resolved against page and user hints. */
export type Ambiguous = 'DOLLAR' | 'YEN' | 'KR';

export interface RawPrice {
  amount: number;
  currency: string | Ambiguous;
  index: number;
  length: number;
}

const CODES = [
  'USD', 'CAD', 'AUD', 'NZD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
  'HUF', 'MXN', 'BRL', 'KRW', 'SGD', 'HKD', 'ZAR', 'TRY', 'ILS', 'PHP', 'THB', 'IDR', 'MYR', 'RON', 'BGN',
  'ISK', 'TWD', 'VND', 'NGN', 'UAH', 'AED', 'SAR', 'ARS', 'CLP', 'COP', 'EGP', 'PKR', 'RUB',
];

const PREFIX: [string, string][] = [
  ['US$', 'USD'], ['US $', 'USD'], ['CA$', 'CAD'], ['CAD$', 'CAD'], ['C$', 'CAD'], ['C $', 'CAD'],
  ['AU$', 'AUD'], ['AU $', 'AUD'], ['A$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'], ['SG$', 'SGD'],
  ['S$', 'SGD'], ['MX$', 'MXN'], ['R$', 'BRL'], ['NT$', 'TWD'], ['CN¥', 'CNY'], ['JP¥', 'JPY'],
  ['E£', 'EGP'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'YEN'], ['￥', 'YEN'], ['₹', 'INR'], ['Rs.', 'INR'],
  ['Rs', 'INR'], ['₩', 'KRW'], ['₽', 'RUB'], ['₺', 'TRY'], ['₪', 'ILS'], ['₱', 'PHP'], ['฿', 'THB'],
  ['₫', 'VND'], ['₦', 'NGN'], ['₴', 'UAH'], ['Rp', 'IDR'], ['RM', 'MYR'], ['Fr.', 'CHF'], ['kr', 'KR'],
  ['zł', 'PLN'], ['$', 'DOLLAR'],
  ...CODES.map((c): [string, string] => [c, c]),
];

const SUFFIX: [string, string][] = [
  ['€', 'EUR'], ['£', 'GBP'], ['zł', 'PLN'], ['kr', 'KR'], ['Kč', 'CZK'], ['Ft', 'HUF'], ['lei', 'RON'],
  ['лв', 'BGN'], ['₽', 'RUB'], ['₺', 'TRY'], ['₫', 'VND'], ['₴', 'UAH'], ['₹', 'INR'], ['₪', 'ILS'],
  ['₩', 'KRW'], ['円', 'JPY'], ['元', 'CNY'], ['원', 'KRW'], ['$', 'DOLLAR'], ['¥', 'YEN'],
  ...CODES.map((c): [string, string] => [c, c]),
];

/** Mostly-prefix symbols: as a suffix they must not be followed by another number ("Size 10 $25"). */
const PREFIX_FIRST: Record<string, true> = { $: true, '¥': true };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function alternation(tokens: [string, string][], suffix: boolean): { source: string; lookup: Map<string, string> } {
  const lookup = new Map(tokens);
  const source = [...lookup.keys()]
    .sort((a, b) => b.length - a.length)
    .map((t) => {
      let p = escape(t);
      // Letter tokens must not be glued to words: "Rs" in "Charges", "kr" in "krone".
      if (/^\p{L}/u.test(t) && !suffix) p = `(?<!\\p{L})${p}`;
      if (/\p{L}$/u.test(t)) p = `${p}(?!\\p{L})`;
      if (suffix && PREFIX_FIRST[t]) p = `${p}(?!\\s?\\d)`;
      return p;
    })
    .join('|');
  return { source, lookup };
}

/** Amount pattern. Plain spaces only group thousands before a suffix ("1 299 kr"), never after a prefix ("$5 100 items"). */
const num = (groupSep: string) =>
  String.raw`(?<![\d.,])(?:\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d{1,2})?|\d{1,3}(?:[${groupSep}]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)`;
const pre = alternation(PREFIX, false);
const suf = alternation(SUFFIX, true);
const PRICE_RE = new RegExp(
  `(${pre.source})\\s?(${num(",.'’\\u00a0\\u202f\\u2009")})|(${num(",.'’\\u00a0\\u202f\\u2009 ")})\\s?(${suf.source})`,
  'gu',
);

const ZERO_DECIMAL: Record<string, true> = { JPY: true, KRW: true, VND: true, CLP: true, ISK: true };

/** Parse "1,299.99", "1.299,99", "1 299", "12,99" into a number. */
export function parseAmount(raw: string, currency: string): number {
  const s = raw.replace(/[\s'’]/g, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalAt = -1;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else {
    const at = Math.max(lastDot, lastComma);
    if (at >= 0 && !ZERO_DECIMAL[currency]) {
      const separators = s.split(s[at]!).length - 1;
      const digitsAfter = s.length - at - 1;
      // A lone separator followed by 3 digits is a thousands separator ("1,299").
      if (separators === 1 && digitsAfter !== 3) decimalAt = at;
    }
  }
  const whole = (decimalAt >= 0 ? s.slice(0, decimalAt) : s).replace(/[.,]/g, '');
  const fraction = decimalAt >= 0 ? s.slice(decimalAt + 1) : '';
  return Number(fraction ? `${whole}.${fraction}` : whole);
}

export function findPrices(text: string): RawPrice[] {
  const out: RawPrice[] = [];
  for (const m of text.matchAll(PRICE_RE)) {
    const token = m[1] ?? m[4] ?? '';
    const number = m[2] ?? m[3] ?? '';
    const currency = (m[1] ? pre.lookup : suf.lookup).get(token);
    if (!currency) continue;
    const amount = parseAmount(number, currency);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({ amount, currency, index: m.index, length: m[0].length });
  }
  return out;
}

const LABEL = /^(?:(?:now|sale|from|only|price|our price|sale price|current price|your price|starting at|as low as)\s*:?\s*)/i;

/** The single price that makes up all of `text` (allowing a short label), or null. */
export function wholePrice(text: string): RawPrice | null {
  const t = text.replace(/\s+/g, ' ').trim().replace(LABEL, '');
  if (!t || t.length > 40) return null;
  const found = findPrices(t);
  if (found.length !== 1) return null;
  const [p] = found as [RawPrice];
  const rest = t.slice(p.index + p.length).trim();
  return p.index === 0 && (rest === '' || /^[A-Z]{3}$/.test(rest)) ? p : null;
}

/** "–", "-", "to" between two prices makes a range. */
export const RANGE_GAP = /^\s*(?:-|–|—|to)\s*$/i;

const FAMILIES: Record<Ambiguous, string[]> = {
  DOLLAR: ['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN', 'TWD', 'ARS', 'CLP', 'COP'],
  YEN: ['JPY', 'CNY'],
  KR: ['SEK', 'NOK', 'DKK', 'ISK'],
};

/** Resolve "$", "¥", "kr" using the page's currency, then the user's, then the most common one. */
export function resolveCurrency(currency: string, page: string | null, user: string): string {
  const family = FAMILIES[currency as Ambiguous];
  if (!family) return currency;
  if (page && family.includes(page)) return page;
  if (family.includes(user)) return user;
  return family[0]!;
}
