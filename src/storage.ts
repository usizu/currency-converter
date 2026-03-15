import type { CurrencyPair, CachedRates, ConversionEntry } from './types';

const KEYS = {
  pair: 'cc_pair',
  rates: 'cc_rates',
  currencies: 'cc_currencies',
  history: 'cc_history',
  amount: 'cc_amount',
  hidden: 'cc_hidden',
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

export function getHiddenCurrencies(): Set<string> {
  const arr = get<string[]>(KEYS.hidden);
  return new Set(arr ?? []);
}

export function setHiddenCurrencies(hidden: Set<string>): void {
  set(KEYS.hidden, [...hidden]);
}
