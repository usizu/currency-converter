import type { CachedRates } from './types';
import { getCachedRates, setCachedRates, getCachedCurrencies, setCachedCurrencies } from './storage';

const BASE_URL = 'https://api.frankfurter.dev';

export async function fetchCurrencies(): Promise<Record<string, string>> {
  const cached = getCachedCurrencies();
  try {
    const res = await fetch(`${BASE_URL}/currencies`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: Record<string, string> = await res.json();
    setCachedCurrencies(data);
    return data;
  } catch {
    if (cached) return cached;
    throw new Error('No currencies available offline');
  }
}

export async function fetchRates(base: string): Promise<CachedRates> {
  const cached = getCachedRates();
  try {
    const res = await fetch(`${BASE_URL}/latest?from=${base}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: { base: string; date: string; rates: Record<string, number> } = await res.json();
    const cachedRates: CachedRates = {
      base: data.base,
      date: data.date,
      rates: { ...data.rates, [data.base]: 1 },
      fetchedAt: Date.now(),
    };
    setCachedRates(cachedRates);
    return cachedRates;
  } catch {
    if (cached) return cached;
    throw new Error('No rates available offline');
  }
}
