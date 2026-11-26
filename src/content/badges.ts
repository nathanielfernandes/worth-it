import { MARK } from './card';
import { priceOf, scanInline, type Found } from './detect';

/**
 * Inline badges next to prices. Same privacy model as the card: closed shadow root,
 * generated-content text, and a fixed-size host so layout can't reveal the label length.
 */

export const BADGE_TAG = 'worth-it-badge';

const BADGE_CSS = `
:host {
  all: initial !important; display: inline-block !important; width: 64px !important; height: 20px !important;
  margin: 0 0 0 6px !important; padding: 0 !important; vertical-align: middle !important; flex: none !important;
  position: static !important;
}
.b {
  box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 4px;
  width: 64px; height: 20px; padding: 0 7px; border-radius: 6px;
  background: rgba(24, 24, 27, 0.92); color: #fafafa;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1), 0 1px 2px rgba(0,0,0,0.18);
  font: 600 11px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0.01em; white-space: nowrap;
  user-select: none; -webkit-font-smoothing: antialiased;
}
.b svg { flex: none; width: 9px; height: 11px; opacity: 0.85; }
.b span::before { content: attr(data-t); }
`;

interface Entry {
  host: HTMLElement;
  label: HTMLElement;
  found: Found;
  reinserts: number;
}

/** Always returns text ("–" when unknown), so badge presence never depends on the user's settings. */
type Labeler = (found: Found) => string;

const entries = new Map<Element, Entry>();
const byHost = new WeakMap<Element, Found>();
let sheet: CSSStyleSheet | null = null;
let observer: MutationObserver | null = null;
let pending = new Set<Element>();
let timer = 0;
let labeler: Labeler = () => '–';
let user = 'USD';

export const foundForBadge = (host: Element) => byHost.get(host);

function createBadge(found: Found, text: string): Entry {
  const host = document.createElement(BADGE_TAG);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(BADGE_CSS);
  }
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = `<div class="b">${MARK}<span></span></div>`;
  const label = root.querySelector('span')!;
  label.setAttribute('data-t', text);
  byHost.set(host, found);
  const entry = { host, label, found, reinserts: 0 };
  insert(entry);
  return entry;
}

/** Beside inline prices; at the end of block-level price containers. */
function insert({ host, found }: Entry): void {
  const display = getComputedStyle(found.el).display;
  if (display.startsWith('inline') || display === 'contents') found.el.after(host);
  else found.el.append(host);
}

function remove(el: Element, entry: Entry): void {
  entry.host.remove();
  entries.delete(el);
}

function scan(root: Element): void {
  for (const found of scanInline(root, user, (el) => entries.has(el))) {
    entries.set(found.el, createBadge(found, labeler(found)));
  }
}

/** Re-check tracked prices: gone, re-rendered by the page, or changed value. */
function revalidate(): void {
  for (const [el, entry] of entries) {
    if (!el.isConnected) {
      remove(el, entry);
      continue;
    }
    if (!entry.host.isConnected) {
      // Frameworks may drop our node on re-render; re-add a few times, then let it go.
      if (entry.reinserts++ >= 3) {
        entries.delete(el);
        continue;
      }
      insert(entry);
    }
    const found = priceOf(el, user);
    if (!found) {
      remove(el, entry);
      continue;
    }
    entry.found = found;
    byHost.set(entry.host, found);
    entry.label.setAttribute('data-t', labeler(found));
  }
}

function flush(): void {
  timer = 0;
  const roots = pending;
  pending = new Set();
  revalidate();
  if (roots.size > 40) return scan(document.body);
  for (const root of roots) if (root.isConnected) scan(root);
}

const isOurs = (n: Node) => n.nodeName === BADGE_TAG.toUpperCase();

function onMutations(records: MutationRecord[]): void {
  for (const r of records) {
    if (r.type === 'childList' && [...r.addedNodes].every(isOurs) && [...r.removedNodes].every(isOurs)) continue;
    const el = r.target.nodeType === Node.ELEMENT_NODE ? (r.target as Element) : r.target.parentElement;
    if (el && !isOurs(el)) pending.add(el);
  }
  if (pending.size && !timer) timer = window.setTimeout(flush, 250);
}

export function startBadges(currency: string, label: Labeler): void {
  user = currency;
  labeler = label;
  if (observer) return;
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan(document.body);
}

export function stopBadges(): void {
  observer?.disconnect();
  observer = null;
  clearTimeout(timer);
  timer = 0;
  pending.clear();
  for (const [el, entry] of entries) remove(el, entry);
}

/** Settings changed: relabel everything in place. */
export function refreshBadges(currency: string, label: Labeler): void {
  user = currency;
  labeler = label;
  revalidate();
  scan(document.body);
}
