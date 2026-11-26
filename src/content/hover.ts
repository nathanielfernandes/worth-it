import { BADGE_TAG, foundForBadge } from './badges';
import { hideCard, showCard, type CardView } from './card';
import { detectAt, type Found } from './detect';

type Describe = (found: Found) => CardView;

const SHOW_DELAY = 110;
const HIDE_DELAY = 140;

let current: Found | null = null;
let showTimer = 0;
let hideTimer = 0;
let user = 'USD';
let describe: Describe = () => ({ title: '', detail: '', growth: '' });

function show(found: Found): void {
  current = found;
  showCard(found.el, describe(found));
}

function hide(): void {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  current = null;
  hideCard();
}

function onOver(e: MouseEvent): void {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (current && (current.el.contains(target) || foundForBadge(target)?.el === current.el)) {
    clearTimeout(hideTimer);
    return;
  }
  const found = target.localName === BADGE_TAG ? foundForBadge(target) : detectAt(target, user);
  clearTimeout(showTimer);
  if (!found) {
    if (current) {
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hide, HIDE_DELAY);
    }
    return;
  }
  clearTimeout(hideTimer);
  // Already showing: move instantly. Otherwise wait briefly so sweeping the mouse doesn't flicker.
  if (current) show(found);
  else showTimer = window.setTimeout(() => show(found), SHOW_DELAY);
}

function onOut(e: MouseEvent): void {
  if (!e.relatedTarget) hide(); // left the window
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') hide();
}

export function startHover(currency: string, fn: Describe): void {
  user = currency;
  describe = fn;
  document.addEventListener('mouseover', onOver, { capture: true, passive: true });
  document.addEventListener('mouseout', onOut, { capture: true, passive: true });
  document.addEventListener('keydown', onKey, { capture: true, passive: true });
  addEventListener('blur', hide);
}

export function updateHover(currency: string, fn: Describe): void {
  user = currency;
  describe = fn;
  if (current) show(current);
}

export function stopHover(): void {
  hide();
  document.removeEventListener('mouseover', onOver, { capture: true });
  document.removeEventListener('mouseout', onOut, { capture: true });
  document.removeEventListener('keydown', onKey, { capture: true });
  removeEventListener('blur', hide);
}
