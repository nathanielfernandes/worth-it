import { formatMoney } from '../shared/currency';
import { KEYS, loadAll, normalizeRates, normalizeSettings, toggleSite, type Stored } from '../shared/settings';
import { exchangeRate, longLabel, rangeLabel, shortLabel, toSpan, workRate, type Span, type WorkRate } from '../shared/work';
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

function describe(found: Found): CardView {
  const user = stored.settings.currency;
  const original = found.prices.map((p) => formatMoney(p.amount, p.currency)).join(' – ');
  const amounts = convert(found);
  if (!rate || !amounts) {
    return { title: `No ${found.prices[0]?.currency} rate yet`, detail: `${original} · add one in Worth It?` };
  }
  const r = rate;
  const [a, b] = amounts.map((x) => toSpan(x / r.hourly, r)) as [Span, Span | undefined];
  const converted = found.prices.some((p) => p.currency !== user);
  return {
    title: b ? rangeLabel(a, b) : longLabel(a),
    detail: converted ? `${original} ≈ ${amounts.map((x) => formatMoney(x, user)).join(' – ')}` : original,
  };
}

function badgeLabel(found: Found): string | null {
  const amounts = convert(found);
  if (!rate || !amounts || amounts.length !== 1) return null;
  return shortLabel(toSpan(amounts[0]! / rate.hourly, rate));
}

function apply(): void {
  rate = workRate(stored.settings);
  const user = stored.settings.currency;
  const active = stored.settings.enabled && rate !== null && !stored.disabledSites.includes(HOST);

  if (active && !hoverOn) startHover(user, describe);
  else if (!active && hoverOn) stopHover();
  else if (active) updateHover(user, describe);
  hoverOn = active;

  const wantBadges = active && stored.settings.inline;
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
