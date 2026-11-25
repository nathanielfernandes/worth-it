import { fetchRates, type RatesReply } from './shared/rates';
import { defaultSettings, KEYS, loadAll } from './shared/settings';

const ALARM = 'refresh-rates';
const DAY_MS = 24 * 60 * 60 * 1000;

async function refresh(): Promise<RatesReply> {
  const { settings } = await loadAll();
  try {
    const rates = await fetchRates(settings.currency);
    await chrome.storage.local.set({ [KEYS.rates]: rates });
    return { ok: true, rates };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Keep the daily alarm in step with the chosen mode; refresh if rates are stale or for another currency. */
async function syncSchedule(): Promise<void> {
  const { settings, rates } = await loadAll();
  if (settings.ratesMode !== 'daily') {
    await chrome.alarms.clear(ALARM);
    return;
  }
  if (!(await chrome.alarms.get(ALARM))) {
    await chrome.alarms.create(ALARM, { periodInMinutes: 24 * 60 });
  }
  if (!rates || rates.base !== settings.currency || Date.now() - rates.fetchedAt > DAY_MS) await refresh();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const got = await chrome.storage.local.get(KEYS.settings);
  if (!got[KEYS.settings]) await chrome.storage.local.set({ [KEYS.settings]: defaultSettings() });
  if (reason === 'install') await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?welcome') });
  await syncSchedule();
});

chrome.runtime.onStartup.addListener(() => void syncSchedule());

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[KEYS.settings];
  if (area !== 'local' || !change) return;
  const before = change.oldValue as { ratesMode?: string; currency?: string } | undefined;
  const after = change.newValue as { ratesMode?: string; currency?: string } | undefined;
  if (before?.ratesMode !== after?.ratesMode || before?.currency !== after?.currency) void syncSchedule();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void refresh();
});

chrome.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
  // Only our own extension pages (popup, or the popup opened as a tab) may trigger a fetch.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if ((msg as { type?: string } | null)?.type !== 'fetch-rates') return;
  void refresh().then(reply);
  return true; // async reply
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-site') return;
  const id = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (id !== undefined) chrome.tabs.sendMessage(id, { type: 'toggle-site' }).catch(() => {});
});
