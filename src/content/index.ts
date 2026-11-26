import { formatMoney } from '../shared/currency';
import { KEYS, loadAll, normalizeRates, normalizeSettings, toggleSite, type Settings, type Stored } from '../shared/settings';
import {
  exchangeRate,
  growthTerms,
  grownValue,
  longLabel,
  rangeLabel,
  shortLabel,
  toSpan,
  workRate,
  type Span,
  type WorkRate,
} from '../shared/work';
import { refreshBadges, startBadges, stopBadges } from './badges';
import { showToast, type CardView } from './card';
import type { Found } from './detect';
import { startHover, stopHover, updateHover } from './hover';

const HOST = location.hostname;

let stored: Stored;
let rate: WorkRate | null = null;
let hoverOn = false;
let badgesOn = false;

/** Price amounts converted to the user's currency, or null if any rate is missing. */
function convert(found: Found): number[] | null {
  const out: number[] = [];
  for (const p of found.prices) {
    const fx = exchangeRate(p.currency, stored.settings.currency, stored.settings, stored.rates);
    if (fx === null) return null;
    out.push(p.amount * fx);
  }
  return out;
}

/**
 * What the card actually shows. "Both" without pay set up falls back to growth, which needs no pay.
 * "Time" without pay set up never runs (see `apply`).
 */
const effectiveShow = (s: Settings): Settings['show'] => (s.show === 'both' && !rate ? 'growth' : s.show);

/** Amounts to grow: in the user's currency when convertible, otherwise in the price's own currency. */
function growthBase(found: Found, converted: number[] | null): { values: number[]; currency: string } {
  if (converted) return { values: converted, currency: stored.settings.currency };
  return { values: found.prices.map((p) => p.amount), currency: found.prices[0]?.currency ?? stored.settings.currency };
}

function describe(found: Found): CardView {
  const s = stored.settings;
  const user = s.currency;
  const show = effectiveShow(s);
  const original = found.prices.map((p) => formatMoney(p.amount, p.currency)).join(' – ');
  const amounts = convert(found);
  const foreign = found.prices.some((p) => p.currency !== user);
  const price = amounts && foreign ? `${original} ≈ ${amounts.map((x) => formatMoney(x, user)).join(' – ')}` : original;

  const base = growthBase(found, amounts);
  const grown = base.values.map((v) => formatMoney(grownValue(v, s), base.currency, 'whole')).join(' – ');
  const terms = growthTerms(s);
  if (show === 'growth') {
    return { title: `${grown} in ${terms.years}`, detail: `${price} invested at ${terms.rate}`, growth: '' };
  }

  const growth = show === 'both' ? `↗ ${grown} in ${terms.years} at ${terms.rate}` : '';
  if (!rate || !amounts) {
    return { title: `No ${found.prices[0]?.currency} rate yet`, detail: `${original} · add one in Worth It?`, growth };
  }
  const r = rate;
  const [a, b] = amounts.map((x) => toSpan(x / r.hourly, r)) as [Span, Span | undefined];
  return { title: b ? rangeLabel(a, b) : longLabel(a), detail: price, growth };
}

/**
 * Badge text. Always a string ("–" when it can't be computed) so whether a price gets a badge never
 * depends on the user's currency or rates, which a page could otherwise probe for.
 */
function badgeLabel(found: Found): string {
  const s = stored.settings;
  const show = effectiveShow(s);
  const metric = show === 'both' ? s.badgeShows : show;
  const amounts = convert(found);
  if (metric === 'growth') {
    const base = growthBase(found, amounts);
    return base.values.length === 1 ? formatMoney(grownValue(base.values[0]!, s), base.currency, 'compact') : '–';
  }
  if (!rate || !amounts || amounts.length !== 1) return '–';
  return shortLabel(toSpan(amounts[0]! / rate.hourly, rate));
}

function apply(): void {
  const s = stored.settings;
  rate = workRate(s);
  const user = s.currency;
  // Growth needs no pay setup; time does.
  const active = s.enabled && !stored.disabledSites.includes(HOST) && (s.show !== 'time' || rate !== null);

  if (active && !hoverOn) startHover(user, describe);
  else if (!active && hoverOn) stopHover();
  else if (active) updateHover(user, describe);
  hoverOn = active;

  const wantBadges = active && s.inline;
  if (wantBadges && !badgesOn) startBadges(user, badgeLabel);
  else if (!wantBadges && badgesOn) stopBadges();
  else if (wantBadges) refreshBadges(user, badgeLabel);
  badgesOn = wantBadges;
}

async function init(): Promise<void> {
  stored = await loadAll();
  apply();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const { [KEYS.settings]: settings, [KEYS.rates]: rates, [KEYS.disabledSites]: sites } = changes;
    if (settings) stored.settings = normalizeSettings(settings.newValue);
    if (rates) stored.rates = normalizeRates(rates.newValue);
    if (sites) stored.disabledSites = Array.isArray(sites.newValue) ? sites.newValue : [];
    apply();
  });

  chrome.runtime.onMessage.addListener((msg: unknown, _sender, reply) => {
    const type = (msg as { type?: string } | null)?.type;
    if (type === 'site') {
      reply({ host: HOST, disabled: stored.disabledSites.includes(HOST) });
    } else if (type === 'toggle-site') {
      void toggleSite(HOST).then((on) => showToast(on ? `Worth It? is on for ${HOST}` : `Worth It? paused on ${HOST}`));
    }
  });
}

void init();
