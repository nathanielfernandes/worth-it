import { isCurrency, REGION_CURRENCY } from '../shared/currency';
import { findPrices, RANGE_GAP, resolveCurrency, wholePrice, type RawPrice } from './parse';

export interface Price {
  amount: number;
  currency: string;
}

export interface Found {
  /** Element the price is drawn in; the card anchors to it. */
  el: Element;
  /** One price, or two for a range. */
  prices: Price[];
}

/** Never read prices out of form fields, code, or editable regions. */
const SKIP = 'input,textarea,select,option,script,style,noscript,template,svg,[contenteditable=""],[contenteditable="true"]';
const AMAZON = '.a-price';
const BLOCK_TAGS: Record<string, true> = {
  ADDRESS: true, ARTICLE: true, ASIDE: true, BLOCKQUOTE: true, BR: true, DD: true, DIV: true, DL: true,
  DT: true, FIGCAPTION: true, FIGURE: true, FOOTER: true, FORM: true, H1: true, H2: true, H3: true,
  H4: true, H5: true, H6: true, HEADER: true, HR: true, LI: true, MAIN: true, NAV: true, OL: true,
  P: true, SECTION: true, TABLE: true, TD: true, TH: true, TR: true, UL: true,
};

// ---------------------------------------------------------------------------
// Page currency hints

let pageCurrencyFor = '';
let pageCurrencyCache: string | null = null;

/** The currency this page prices in, from structured data, then TLD, then language. */
function pageCurrency(): string | null {
  if (pageCurrencyFor === location.href) return pageCurrencyCache;
  pageCurrencyFor = location.href;
  pageCurrencyCache = readPageCurrency();
  return pageCurrencyCache;
}

function readPageCurrency(): string | null {
  const meta = document.querySelector(
    'meta[property="product:price:currency"], meta[property="og:price:currency"], [itemprop="priceCurrency"]',
  );
  const fromMeta = (meta?.getAttribute('content') ?? meta?.textContent ?? '').trim().toUpperCase();
  if (isCurrency(fromMeta)) return fromMeta;

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    const code = /"priceCurrency"\s*:\s*"([A-Za-z]{3})"/.exec(script.textContent ?? '')?.[1]?.toUpperCase();
    if (isCurrency(code)) return code;
  }

  // Two-letter country TLDs, except ones commonly used generically (.co, .io, .tv …).
  const tld = location.hostname.split('.').pop()?.toUpperCase() ?? '';
  if (tld.length === 2 && tld !== 'CO') {
    const code = REGION_CURRENCY[tld];
    if (code) return code;
  }

  const region = /^[a-z]{2,3}-([A-Za-z]{2})\b/.exec(document.documentElement.lang)?.[1]?.toUpperCase();
  return (region && REGION_CURRENCY[region]) || null;
}

const toPrice = (raw: RawPrice, user: string): Price => ({
  amount: raw.amount,
  currency: resolveCurrency(raw.currency, pageCurrency(), user),
});

// ---------------------------------------------------------------------------
// Text extraction

interface Extracted {
  text: string;
  nodes: Text[];
  starts: number[];
}

function nearestBlock(node: Node, stop: Element): Element {
  for (let e = node.parentElement; e && e !== stop; e = e.parentElement) {
    if (BLOCK_TAGS[e.tagName]) return e;
  }
  return stop;
}

/** Cents drawn raised or smaller next to the dollars: "$249<sup>99</sup>". */
function isRaisedCents(el: Element, prev: Element): boolean {
  if (el.closest('sup')) return true;
  const style = getComputedStyle(el);
  if (style.verticalAlign !== 'baseline') return true;
  return parseFloat(style.fontSize) < parseFloat(getComputedStyle(prev).fontSize) * 0.85;
}

/**
 * Concatenate the visible text of `el`, rejoining split prices ("$" "249" "99" → "$249.99")
 * and separating block-level pieces so "$12" + "3 left" don't fuse into "$123".
 */
function extract(el: Element): Extracted {
  const out: Extracted = { text: '', nodes: [], starts: [] };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let prev: Text | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const parent = n.parentElement;
    if (!parent || parent.closest(SKIP)) continue;
    if (prev?.parentElement && out.text) {
      if (/\d$/.test(out.text) && /^\s*\d{2}\s*$/.test(n.data) && isRaisedCents(parent, prev.parentElement)) {
        out.text += '.';
      } else if (nearestBlock(n, el) !== nearestBlock(prev, el)) {
        out.text += ' ';
      }
    }
    out.nodes.push(n);
    out.starts.push(out.text.length);
    out.text += n.data;
    prev = n;
  }
  return out;
}

function nodeAt(x: Extracted, index: number): Text | undefined {
  let i = 0;
  while (i + 1 < x.starts.length && x.starts[i + 1]! <= index) i++;
  return x.nodes[i];
}

function isStruck(from: Element): boolean {
  let e: Element | null = from;
  for (let depth = 0; e && depth < 8; depth++, e = e.parentElement) {
    if (e.matches('del, s, strike')) return true;
    if (getComputedStyle(e).textDecorationLine.includes('line-through')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Site rules

function amazon(el: Element, user: string): Found | null {
  const text =
    el.querySelector('.a-offscreen')?.textContent?.trim() || el.querySelector('[aria-hidden="true"]')?.textContent || '';
  const raw = findPrices(text)[0];
  return raw ? { el, prices: [toPrice(raw, user)] } : null;
}

const amazonStruck = (el: Element) => el.classList.contains('a-text-price') || el.getAttribute('data-a-strike') === 'true';

// ---------------------------------------------------------------------------
// Hover

/** Find the price under the pointer: the smallest short element around `target` that contains one. */
export function detectAt(target: Element, user: string): Found | null {
  if (target.closest(SKIP)) return null;
  const amz = target.closest(AMAZON);
  if (amz) return amazon(amz, user);

  let el: Element | null = target;
  for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
    if (el === document.body || el === document.documentElement || el.childElementCount > 16) break;
    const raw = el.textContent ?? '';
    if (raw.length > 120) break;
    if (!/\d/.test(raw)) continue;
    const x = extract(el);
    // Product tiles and paragraphs are long; price containers are short. Only claim the latter.
    if (x.text.replace(/\s+/g, ' ').trim().length > 48) break;
    const found = findPrices(x.text);
    if (found.length) return choose(el, target, x, found, user);
  }
  return null;
}

function choose(el: Element, target: Element, x: Extracted, found: RawPrice[], user: string): Found {
  // Screen-reader duplicates ("current price $20" + "$20") collapse to one.
  const unique = found.filter(
    (p, i) => found.findIndex((q) => q.amount === p.amount && q.currency === p.currency) === i,
  );
  const [a, b] = unique as [RawPrice, RawPrice | undefined];
  if (unique.length === 2 && b && RANGE_GAP.test(x.text.slice(a.index + a.length, b.index))) {
    return { el, prices: [toPrice(a, user), toPrice(b, user)] };
  }
  // Prefer the price the pointer is on, then any that isn't crossed out.
  const under = unique.find((p) => {
    const node = nodeAt(x, p.index);
    return node && target.contains(node);
  });
  const live = unique.find((p) => {
    const parent = nodeAt(x, p.index)?.parentElement;
    return !parent || !isStruck(parent);
  });
  return { el, prices: [toPrice(under ?? live ?? a, user)] };
}

// ---------------------------------------------------------------------------
// Inline scan

function isVisible(el: Element): boolean {
  if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width >= 4 && r.height >= 4 && r.right > 0;
}

/** Parse `el` as a standalone price (the whole element is one price), else null. */
export function priceOf(el: Element, user: string): Found | null {
  if (el.matches(AMAZON)) return amazonStruck(el) ? null : amazon(el, user);
  const raw = wholePrice(extract(el).text);
  return raw ? { el, prices: [toPrice(raw, user)] } : null;
}

/**
 * Find standalone, visible, current (not crossed-out) prices under `root`.
 * `known` elements are skipped. Returns innermost matches only.
 */
export function scanInline(root: Element, user: string, known: (el: Element) => boolean): Found[] {
  const candidates: Found[] = [];
  const checked = new Set<Element>();

  const amazonEls = root.matches(AMAZON) ? [root] : root.querySelectorAll(AMAZON);
  for (const el of amazonEls) {
    if (known(el) || amazonStruck(el) || !isVisible(el)) continue;
    const found = amazon(el, user);
    if (found) candidates.push(found);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n as Text).data.length <= 40 && /\d/.test((n as Text).data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let el = n.parentElement;
    if (!el || el.closest(SKIP) || el.closest(AMAZON)) continue;
    for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
      if (checked.has(el) || el === document.body || el.childElementCount > 8) break;
      checked.add(el);
      if ((el.textContent?.length ?? 0) > 60) break;
      const raw = wholePrice(extract(el).text);
      if (!raw) continue;
      if (!known(el) && isVisible(el) && !isStruck(el)) candidates.push({ el, prices: [toPrice(raw, user)] });
      break;
    }
  }

  // Keep the innermost match when a price sits inside another matched element.
  return candidates.filter((c) => !candidates.some((o) => o !== c && c.el.contains(o.el)));
}
