import type { CurrencyPair, CachedRates, ConversionEntry } from './types';

const KEYS = {
  pair: 'cc_pair',
  rates: 'cc_rates',
  currencies: 'cc_currencies',
  history: 'cc_history',
  amount: 'cc_amount',
  hidden: 'cc_hidden',
  fontSize: 'cc_fontsize',
  showCrypto: 'cc_showcrypto',
  theme: 'cc_theme',
  mode: 'cc_mode',
  system: 'cc_system',
} as const;

const MAX_HISTORY = 50;

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function set(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getSelectedPair(): CurrencyPair {
  return get<CurrencyPair>(KEYS.pair) ?? { from: 'USD', to: 'EUR' };
}

export function setSelectedPair(pair: CurrencyPair): void {
  set(KEYS.pair, pair);
}

export function getCachedRates(): CachedRates | null {
  return get<CachedRates>(KEYS.rates);
}

export function setCachedRates(data: CachedRates): void {
  set(KEYS.rates, data);
}

export function getCachedCurrencies(): Record<string, string> | null {
  return get<Record<string, string>>(KEYS.currencies);
}

export function setCachedCurrencies(data: Record<string, string>): void {
  set(KEYS.currencies, data);
}

export function getHistory(): ConversionEntry[] {
  return get<ConversionEntry[]>(KEYS.history) ?? [];
}

export function addToHistory(entry: ConversionEntry): void {
  const history = getHistory();
  // Remove existing duplicate (same amount + pair) so it surfaces to top
  const dupeIdx = history.findIndex(
    (h) => h.amount === entry.amount && h.from === entry.from && h.to === entry.to
  );
  if (dupeIdx !== -1) history.splice(dupeIdx, 1);
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  set(KEYS.history, history);
}

export function removeHistoryEntry(index: number): void {
  const history = getHistory();
  history.splice(index, 1);
  set(KEYS.history, history);
}

export function clearHistory(): void {
  localStorage.removeItem(KEYS.history);
}

export function getLastAmount(): string | null {
  return localStorage.getItem(KEYS.amount);
}

export function setLastAmount(value: string): void {
  localStorage.setItem(KEYS.amount, value);
}

export function getFontSize(): number {
  const val = localStorage.getItem(KEYS.fontSize);
  return val ? parseInt(val, 10) : 100;
}

export function setFontSize(pct: number): void {
  localStorage.setItem(KEYS.fontSize, String(pct));
}

export function getHiddenCurrencies(): Set<string> {
  const arr = get<string[]>(KEYS.hidden);
  // Defensive: ensure we always return a proper Set even if stored data is corrupted
  if (Array.isArray(arr)) return new Set(arr);
  return new Set();
}

export function setHiddenCurrencies(hidden: Set<string>): void {
  set(KEYS.hidden, [...hidden]);
}

export function getShowCrypto(): boolean {
  return localStorage.getItem(KEYS.showCrypto) === 'true';
}

export function setShowCrypto(show: boolean): void {
  localStorage.setItem(KEYS.showCrypto, String(show));
}

export function getTheme(): string {
  return localStorage.getItem(KEYS.theme) ?? 'midnight';
}

export function setTheme(theme: string): void {
  localStorage.setItem(KEYS.theme, theme);
}

export function getMode(): string {
  return localStorage.getItem(KEYS.mode) ?? 'dark';
}

export function setMode(mode: string): void {
  localStorage.setItem(KEYS.mode, mode);
}

export function getSystemTheme(): boolean {
  const val = localStorage.getItem(KEYS.system);
  // Default to true so first-time users get OS-appropriate mode
  return val === null ? true : val === 'true';
}

export function setSystemTheme(on: boolean): void {
  localStorage.setItem(KEYS.system, String(on));
}
