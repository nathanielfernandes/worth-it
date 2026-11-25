import { parseAmount } from '../content/parse';
import { CURRENCIES, currencyName, currencySymbol, formatMoney } from '../shared/currency';
import { RATES_ORIGIN, type RatesReply } from '../shared/rates';
import {
  KEYS,
  loadAll,
  normalizeRates,
  toggleSite,
  type Period,
  type RatesMode,
  type Settings,
  type SyncedRates,
} from '../shared/settings';
import { exchangeRate, longLabel, toSpan, workRate } from '../shared/work';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let s: Settings;
let synced: SyncedRates | null = null;
/** Manual rates into the current pay currency, kept as rows so half-typed values survive re-renders. */
let rateRows: { from: string; value: string }[] = [];

const save = () => chrome.storage.local.set({ [KEYS.settings]: s });

/** Lenient number parsing: "1,234.50", "1234,5", " 80 ". NaN when not a number. */
function readNumber(raw: string): number {
  const t = raw.trim();
  if (!/^\d[\d.,\s'’]*$/.test(t)) return NaN;
  return parseAmount(t, s.currency);
}

const show = (el: HTMLElement, visible: boolean) => {
  el.hidden = !visible;
};

// ---------------------------------------------------------------------------
// Rendering

function renderHero(): void {
  const hero = $('hero');
  const value = $('heroValue');
  const sub = $('heroSub');
  const rate = workRate(s);
  hero.classList.toggle('empty', !rate);
  if (!rate) {
    value.textContent = '—';
    sub.textContent = s.payMode === 'varies' ? 'Add a paycheck and its hours to get started' : 'Enter your pay to get started';
    return;
  }
  const unit = document.createElement('small');
  unit.textContent = ' /hr';
  value.replaceChildren(formatMoney(rate.hourly, s.currency), unit);
  // A round example worth a few hours of work: $100 at $30/hr, ¥10,000 at ¥2,000/hr.
  const example = 10 ** Math.round(Math.log10(rate.hourly * 4));
  const whole = new Intl.NumberFormat(undefined, { style: 'currency', currency: s.currency, maximumFractionDigits: 0 });
  sub.textContent =
    `${whole.format(rate.hourly * rate.hoursPerDay)} per workday · ` +
    `${whole.format(example)} ≈ ${longLabel(toSpan(example / rate.hourly, rate))}`;
}

function renderSegs(): void {
  for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
    const field = seg.dataset.field as 'payMode' | 'basis' | 'ratesMode';
    for (const b of seg.querySelectorAll('button')) {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(b.value === s[field]));
    }
  }
}

function renderVisibility(): void {
  const varies = s.payMode === 'varies';
  show($('steady'), !varies);
  show($('varies'), varies);
  show($('pctRow'), s.basis === 'gross');
  const hourly = s.period === 'hour';
  show($('hoursPer'), !hourly);
  show($('hoursPerFixed'), hourly);
  document.body.classList.toggle('off', !s.enabled);
  for (const el of document.querySelectorAll('[data-symbol]')) el.textContent = currencySymbol(s.currency);
}

function renderChecksSummary(): void {
  const valid = s.paychecks.filter((p) => p.amount > 0 && p.hours > 0);
  const el = $('checksSummary');
  if (!valid.length) {
    el.textContent = 'Add your last few paychecks with the hours each one covered.';
    return;
  }
  const pay = valid.reduce((a, p) => a + p.amount, 0) / valid.length;
  const hours = valid.reduce((a, p) => a + p.hours, 0) / valid.length;
  el.textContent = `Average of ${valid.length}: ${formatMoney(pay, s.currency)} for ${Math.round(hours * 10) / 10} h`;
}

function renderChecks(): void {
  const list = $('checks');
  const tpl = $<HTMLTemplateElement>('checkRow');
  list.replaceChildren();
  s.paychecks.forEach((p, i) => {
    const row = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const amount = row.querySelector<HTMLInputElement>('[data-k="amount"]')!;
    const hours = row.querySelector<HTMLInputElement>('[data-k="hours"]')!;
    amount.value = p.amount ? String(p.amount) : '';
    hours.value = p.hours ? String(p.hours) : '';
    amount.addEventListener('input', () => {
      const n = readNumber(amount.value);
      amount.classList.toggle('bad', amount.value.trim() !== '' && !(n > 0));
      s.paychecks[i]!.amount = n > 0 ? n : 0;
      changed();
    });
    hours.addEventListener('input', () => {
      const n = readNumber(hours.value);
      hours.classList.toggle('bad', hours.value.trim() !== '' && !(n > 0 && n <= 744));
      s.paychecks[i]!.hours = n > 0 && n <= 744 ? n : 0;
      changed();
    });
    row.querySelector('.x')!.addEventListener('click', () => {
      s.paychecks.splice(i, 1);
      if (!s.paychecks.length) s.paychecks.push({ amount: 0, hours: 0 });
      renderChecks();
      changed();
    });
    list.append(row);
  });
  renderVisibility();
  renderChecksSummary();
}

/** What syncing alone would give for 1 `from`, shown as the input placeholder. */
function syncedPlaceholder(from: string): string {
  const fx = exchangeRate(from, s.currency, { ...s, manualRates: {} }, synced);
  return fx ? String(Number(fx.toPrecision(4))) : '';
}

function writeRates(): void {
  for (const key of Object.keys(s.manualRates)) if (key.endsWith(`>${s.currency}`)) delete s.manualRates[key];
  for (const r of rateRows) {
    const n = readNumber(r.value);
    if (r.from !== s.currency && n > 0) s.manualRates[`${r.from}>${s.currency}`] = n;
  }
  save();
}

function renderRates(): void {
  const list = $('rates');
  const tpl = $<HTMLTemplateElement>('rateRow');
  list.replaceChildren();
  rateRows.forEach((r, i) => {
    const row = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const from = row.querySelector<HTMLSelectElement>('[data-k="from"]')!;
    const value = row.querySelector<HTMLInputElement>('[data-k="value"]')!;
    for (const code of CURRENCIES) if (code !== s.currency) from.add(new Option(code, code));
    from.value = r.from;
    value.value = r.value;
    value.placeholder = syncedPlaceholder(r.from) || '0.00';
    row.querySelector('[data-k="to"]')!.textContent = s.currency;
    from.addEventListener('change', () => {
      r.from = from.value;
      value.placeholder = syncedPlaceholder(r.from) || '0.00';
      writeRates();
    });
    value.addEventListener('input', () => {
      r.value = value.value;
      value.classList.toggle('bad', value.value.trim() !== '' && !(readNumber(value.value) > 0));
      writeRates();
    });
    row.querySelector('.x')!.addEventListener('click', () => {
      rateRows.splice(i, 1);
      renderRates();
      writeRates();
    });
    list.append(row);
  });
}

function loadRateRows(): void {
  rateRows = Object.entries(s.manualRates)
    .filter(([key]) => key.endsWith(`>${s.currency}`))
    .map(([key, value]) => ({ from: key.split('>')[0]!, value: String(value) }));
}

function renderSync(): void {
  const mode = s.ratesMode;
  const row = $('syncRow');
  show(row, mode !== 'manual');
  row.classList.remove('error');
  $('syncStatus').textContent = synced
    ? `Rates from ${new Date(`${synced.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${Object.keys(synced.rates).length + 1} currencies`
    : 'Not synced yet';
  $('ratesHint').textContent =
    mode === 'manual'
      ? 'Type in rates for currencies you shop in. Nothing is fetched.'
      : `Central bank reference rates from frankfurter.dev${mode === 'daily' ? ', refreshed daily' : ''}. Only your currency code is sent. Rates you add below take priority.`;
}

function renderAll(): void {
  $<HTMLInputElement>('enabled').checked = s.enabled;
  $<HTMLInputElement>('inline').checked = s.inline;
  $<HTMLSelectElement>('currency').value = s.currency;
  $<HTMLSelectElement>('period').value = s.period;
  $<HTMLSelectElement>('variesPeriod').value = s.paycheckPeriod;
  $<HTMLSelectElement>('hoursPer').value = s.hoursPer;
  for (const key of ['amount', 'hours', 'takeHomePct', 'daysPerWeek', 'weeksPerYear'] as const) {
    $<HTMLInputElement>(key).value = s[key] ? String(s[key]) : '';
  }
  loadRateRows();
  renderSegs();
  renderChecks();
  renderRates();
  renderSync();
  renderHero();
}

/** Persist and refresh everything derived from settings (not the inputs being typed in). */
function changed(): void {
  save();
  renderVisibility();
  renderChecksSummary();
  renderHero();
}

// ---------------------------------------------------------------------------
// Wiring

const NUMBER_FIELDS: { key: 'amount' | 'hours' | 'takeHomePct' | 'daysPerWeek' | 'weeksPerYear'; min: number; max: number }[] = [
  { key: 'amount', min: 0, max: 1e9 },
  { key: 'hours', min: 0, max: 744 },
  { key: 'takeHomePct', min: 1, max: 100 },
  { key: 'daysPerWeek', min: 1, max: 7 },
  { key: 'weeksPerYear', min: 1, max: 52 },
];

async function syncNow(): Promise<void> {
  const button = $<HTMLButtonElement>('syncNow');
  button.disabled = true;
  button.textContent = 'Syncing…';
  try {
    const reply = (await chrome.runtime.sendMessage({ type: 'fetch-rates' })) as RatesReply | undefined;
    if (reply?.ok) {
      synced = reply.rates;
      renderSync();
      renderRates();
    } else {
      $('syncRow').classList.add('error');
      $('syncStatus').textContent = reply?.error ?? 'Sync failed';
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Sync now';
  }
}

async function setRatesMode(mode: RatesMode): Promise<void> {
  if (mode === s.ratesMode) return;
  if (mode === 'manual') {
    s.ratesMode = 'manual';
    synced = null;
    await chrome.storage.local.remove(KEYS.rates);
    // Give the network permission back. Fails harmlessly if Chrome counts it as required.
    await chrome.permissions.remove({ origins: [RATES_ORIGIN] }).catch(() => false);
  } else {
    // Must run directly in the click handler: Chrome only shows the prompt for a user gesture.
    const granted = await chrome.permissions.request({ origins: [RATES_ORIGIN] }).catch(() => false);
    if (!granted) {
      $('ratesHint').textContent = 'Syncing needs permission to reach api.frankfurter.dev.';
      return;
    }
    s.ratesMode = mode;
  }
  await save();
  renderSegs();
  renderSync();
  renderRates();
  // Daily mode is fetched by the background worker when the setting changes.
  if (mode === 'once') await syncNow();
}

function wire(): void {
  for (const { key, min, max } of NUMBER_FIELDS) {
    const input = $<HTMLInputElement>(key);
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const n = readNumber(raw);
      const ok = n >= min && n <= max && (key !== 'hours' || n > 0);
      input.classList.toggle('bad', raw !== '' && !ok);
      if (ok) s[key] = n;
      else if (key === 'amount' && raw === '') s.amount = 0;
      changed();
    });
  }

  $<HTMLSelectElement>('period').addEventListener('change', (e) => {
    s.period = (e.target as HTMLSelectElement).value as Period;
    if (s.period === 'hour') s.hoursPer = 'week';
    $<HTMLSelectElement>('hoursPer').value = s.hoursPer;
    changed();
  });
  $<HTMLSelectElement>('variesPeriod').addEventListener('change', (e) => {
    s.paycheckPeriod = (e.target as HTMLSelectElement).value as Settings['paycheckPeriod'];
    changed();
  });
  $<HTMLSelectElement>('hoursPer').addEventListener('change', (e) => {
    s.hoursPer = (e.target as HTMLSelectElement).value as Settings['hoursPer'];
    changed();
  });
  $<HTMLSelectElement>('currency').addEventListener('change', (e) => {
    s.currency = (e.target as HTMLSelectElement).value;
    loadRateRows();
    renderRates();
    changed();
  });
  $<HTMLInputElement>('enabled').addEventListener('change', (e) => {
    s.enabled = (e.target as HTMLInputElement).checked;
    changed();
  });
  $<HTMLInputElement>('inline').addEventListener('change', (e) => {
    s.inline = (e.target as HTMLInputElement).checked;
    changed();
  });

  for (const seg of document.querySelectorAll<HTMLElement>('.seg')) {
    seg.addEventListener('click', (e) => {
      const button = (e.target as Element).closest('button');
      if (!button) return;
      const field = seg.dataset.field;
      if (field === 'ratesMode') {
        void setRatesMode(button.value as RatesMode);
        return;
      }
      if (field === 'payMode') {
        s.payMode = button.value as Settings['payMode'];
      } else if (field === 'basis') {
        s.basis = button.value as Settings['basis'];
      }
      renderSegs();
      changed();
    });
  }

  $('addCheck').addEventListener('click', () => {
    s.paychecks.push({ amount: 0, hours: 0 });
    renderChecks();
    save();
    $('checks').querySelector<HTMLInputElement>('.row:last-child input')?.focus();
  });

  $('addRate').addEventListener('click', () => {
    const used = new Set(rateRows.map((r) => r.from));
    const from = ['USD', 'EUR', 'GBP', ...CURRENCIES].find((c) => c !== s.currency && !used.has(c)) ?? 'USD';
    rateRows.push({ from, value: '' });
    renderRates();
    $('rates').querySelector<HTMLInputElement>('.row:last-child input')?.focus();
  });

  $('syncNow').addEventListener('click', () => void syncNow());

  chrome.storage.onChanged.addListener((changes, area) => {
    const rates = changes[KEYS.rates];
    if (area === 'local' && rates) {
      synced = normalizeRates(rates.newValue);
      renderSync();
      renderRates();
    }
  });
}

/** Per-site toggle, via the page's content script (no tabs permission needed). */
async function initSite(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || tab.url?.startsWith(chrome.runtime.getURL(''))) return;
  const reply = (await chrome.tabs.sendMessage(tab.id, { type: 'site' }).catch(() => null)) as
    | { host: string; disabled: boolean }
    | null;
  if (!reply?.host) return;
  show($('siteRow'), true);
  $('siteName').textContent = reply.host;
  const toggle = $<HTMLInputElement>('siteEnabled');
  toggle.checked = !reply.disabled;
  toggle.addEventListener('change', () => void toggleSite(reply.host));

  const [command] = await chrome.commands.getAll();
  $('shortcutHint').textContent = command?.shortcut
    ? `Toggle with ${command.shortcut}`
    : 'Set a shortcut at chrome://extensions/shortcuts';
}

async function init(): Promise<void> {
  if (new URLSearchParams(location.search).has('welcome')) {
    document.body.classList.add('page');
    show($('welcome'), true);
  }
  const currency = $<HTMLSelectElement>('currency');
  for (const code of CURRENCIES) currency.add(new Option(`${code} — ${currencyName(code)}`, code));

  const stored = await loadAll();
  s = stored.settings;
  synced = stored.rates;
  renderAll();
  wire();
  await initSite();
  if (!workRate(s) && s.payMode === 'steady') $('amount').focus();
}

void init();
