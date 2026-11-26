/**
 * Hover card and toast. Privacy model:
 * - Rendered in a closed shadow root: page scripts get `null` from `host.shadowRoot`.
 * - All text is CSS generated content (`content: attr(data-t)`), which is not part of the DOM text,
 *   selection, or `window.find()` — so the page can't read or search for it.
 * - The host is a 0×0 top-layer popover: its geometry reveals nothing about what's shown.
 * - Styles use constructed stylesheets, which page CSP and page CSS can't touch.
 */

export interface CardView {
  /** Headline: time of work ("8.3 hours") or grown value ("$9,670 in 20 years"). */
  title: string;
  /** The price, plus its conversion when foreign. */
  detail: string;
  /** "Both" mode: the growth line under a divider. Empty hides it. */
  growth: string;
}

const CARD_CSS = `
:host {
  all: initial !important; display: block !important; position: fixed !important; inset: 0 auto auto 0 !important;
  width: 0 !important; height: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
  background: transparent !important; overflow: visible !important; pointer-events: none !important;
  z-index: 2147483647 !important;
}
.card {
  position: fixed; left: var(--x, 0px); top: var(--y, 0px); box-sizing: border-box; width: 260px;
  padding: 10px 14px; border-radius: 12px;
  background: rgba(24, 24, 27, 0.94); color: #fafafa;
  -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 12px 32px -8px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.18);
  font: 13px/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums;
  pointer-events: none; user-select: none;
  opacity: 0; transition: opacity 0.15s ease;
}
.card.in { opacity: 1; }
.head { display: flex; align-items: center; gap: 8px; }
.icon { flex: none; width: 15px; height: 18px; color: #fafafa; }
.title::before { content: attr(data-t); }
.title { font-size: 18px; font-weight: 650; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.detail { margin: 1px 0 0 23px; color: rgba(250,250,250,0.55); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.growth { margin: 8px 0 0; padding-top: 7px; border-top: 1px solid rgba(255,255,255,0.09); font-size: 13px; font-weight: 550;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.growth[data-t=""] { display: none; }
.detail::before, .growth::before { content: attr(data-t); }
.toast { width: auto; padding: 9px 14px; border-radius: 999px; }
.toast .title { font-size: 13px; font-weight: 550; }
@media (prefers-reduced-motion: reduce) { .card { transition: none; } }
`;

/**
 * The logo mark (hourglass with sand on top and a `$` below), cropped to the glass and drawn in
 * `currentColor`. Shared with the inline badges. Matches assets/icon.svg.
 */
export const MARK = `<svg viewBox="25 19 78 90" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M30 24h68M30 104h68" stroke-width="10"/><path d="M38 26h52c0 24-21 29-21 38s21 14 21 38H38c0-24 21-29 21-38s-21-14-21-38z" stroke-width="8"/></g><path d="M50 38h28c-3 7-9 11-14 14-5-3-11-7-14-14z" fill="currentColor"/><text x="64" y="98" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="29" fill="currentColor">$</text></svg>`;

const ICON = MARK.replace('<svg ', '<svg class="icon" ');

let sheet: CSSStyleSheet | null = null;
function cardSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(CARD_CSS);
  }
  return sheet;
}

/**
 * A 0×0, click-through, top-layer host. Its reset lives in the shadow sheet as `:host { … !important }`:
 * for important rules the shadow context beats the page, so page CSS can't restyle it.
 */
function createHost(tag: 'worth-it-card' | 'worth-it-toast'): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement(tag);
  host.popover = 'manual';
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = [cardSheet()];
  document.documentElement.append(host);
  try {
    host.showPopover(); // top layer: above modals and z-index wars
  } catch {
    // Popover unsupported or blocked; the fixed host with max z-index still works.
  }
  return { host, root };
}

const setText = (el: Element | null | undefined, text: string) => el?.setAttribute('data-t', text);

// ---------------------------------------------------------------------------

let host: HTMLElement | null = null;
let card: HTMLElement | null = null;
let anchor: Element | null = null;
let frame = 0;

function place(): void {
  frame = 0;
  if (!card || !anchor) return;
  if (!anchor.isConnected) return hideCard();
  const r = anchor.getBoundingClientRect();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const gap = 8;
  const below = r.top - h - gap < 8;
  const y = below ? r.bottom + gap : r.top - h - gap;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  card.style.setProperty('--x', `${Math.round(x)}px`);
  card.style.setProperty('--y', `${Math.round(y)}px`);
}

const schedulePlace = () => {
  if (!frame) frame = requestAnimationFrame(place);
};

export function showCard(target: Element, view: CardView): void {
  const fresh = !host;
  if (!host) {
    const created = createHost('worth-it-card');
    host = created.host;
    created.root.innerHTML = `<div class="card"><div class="head">${ICON}<div class="title"></div></div><div class="detail"></div><div class="growth"></div></div>`;
    card = created.root.querySelector('.card');
    addEventListener('scroll', schedulePlace, { capture: true, passive: true });
    addEventListener('resize', schedulePlace, { passive: true });
  }
  if (!card) return;
  anchor = target;
  setText(card.querySelector('.title'), view.title);
  setText(card.querySelector('.detail'), view.detail);
  setText(card.querySelector('.growth'), view.growth);
  place();
  if (fresh) {
    // Next frame, so the entrance transition runs from the hidden state.
    requestAnimationFrame(() => card?.classList.add('in'));
  }
}

export function hideCard(): void {
  anchor = null;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  removeEventListener('scroll', schedulePlace, { capture: true });
  removeEventListener('resize', schedulePlace);
  host?.remove();
  host = null;
  card = null;
}

// ---------------------------------------------------------------------------

let toastTimer = 0;
let toastHost: HTMLElement | null = null;

/** Brief top-center notice, e.g. after the keyboard shortcut toggles a site. */
export function showToast(text: string): void {
  clearTimeout(toastTimer);
  toastHost?.remove();
  const { host: h, root } = createHost('worth-it-toast');
  toastHost = h;
  root.innerHTML = `<div class="card toast"><div class="head">${ICON}<div class="title"></div></div></div>`;
  const el = root.querySelector<HTMLElement>('.card')!;
  setText(el.querySelector('.title'), text);
  el.style.setProperty('--x', `${Math.round(innerWidth / 2 - el.offsetWidth / 2)}px`);
  el.style.setProperty('--y', '16px');
  requestAnimationFrame(() => el.classList.add('in'));
  toastTimer = window.setTimeout(() => {
    el.classList.remove('in');
    toastTimer = window.setTimeout(() => h.remove(), 200);
  }, 1600);
}
