import type { CachedRates } from './types';
import { getCachedRates, setCachedRates, getCachedCurrencies, setCachedCurrencies } from './storage';

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1';
const FALLBACK_BASE = 'https://latest.currency-api.pages.dev/v1';

/** Fetch with automatic fallback to secondary CDN */
async function fetchWithFallback(path: string): Promise<Response> {
  try {
    const res = await fetch(`${CDN_BASE}${path}`);
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch {
    // Fallback to Cloudflare Pages mirror
    const res = await fetch(`${FALLBACK_BASE}${path}`);
    if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
    return res;
  }
}

/** Normalise keys to uppercase (API uses lowercase codes) */
function uppercaseKeys<T>(obj: Record<string, T>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k.toUpperCase()] = v;
  }
  return result;
}

export async function fetchCurrencies(): Promise<Record<string, string>> {
  const cached = getCachedCurrencies();
  try {
    const res = await fetchWithFallback('/currencies.min.json');
    const data: Record<string, string> = await res.json();
    // API returns lowercase codes like { "usd": "US Dollar" }
    const normalized = uppercaseKeys(data);
    // Filter out crypto/precious metals — keep only 3-letter fiat codes
    const fiat: Record<string, string> = {};
    for (const [code, name] of Object.entries(normalized)) {
      if (/^[A-Z]{3}$/.test(code) && name.length > 0) {
        fiat[code] = name;
      }
    }
    setCachedCurrencies(fiat);
    return fiat;
  } catch (err) {
    console.error('fetchCurrencies failed:', err);
    if (cached) return cached;
    throw err;
  }
}

export async function fetchRates(base: string): Promise<CachedRates> {
  const cached = getCachedRates();
  try {
    const code = base.toLowerCase();
    const res = await fetchWithFallback(`/currencies/${code}.min.json`);
    const data: { date: string; [key: string]: unknown } = await res.json();
    // Response shape: { "date": "2026-03-14", "usd": { "eur": 0.92, "gbp": 0.79, ... } }
    const ratesRaw = data[code] as Record<string, number> | undefined;
    if (!ratesRaw) throw new Error(`No rates found for ${base}`);
    const rates = uppercaseKeys(ratesRaw);
    rates[base] = 1; // Ensure base currency is included
    const cachedRates: CachedRates = {
      base,
      date: data.date as string,
      rates,
      fetchedAt: Date.now(),
    };
    setCachedRates(cachedRates);
    return cachedRates;
  } catch (err) {
    console.error('fetchRates failed:', err);
    if (cached) return cached;
    throw err;
  }
}
