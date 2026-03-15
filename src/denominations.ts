// Real banknote denominations for major currencies
const DENOMINATIONS: Record<string, number[]> = {
  USD: [1, 5, 10, 20, 50, 100],
  EUR: [5, 10, 20, 50, 100, 200],
  GBP: [5, 10, 20, 50],
  JPY: [1000, 5000, 10000],
  CHF: [10, 20, 50, 100, 200],
  CAD: [5, 10, 20, 50, 100],
  AUD: [5, 10, 20, 50, 100],
  NZD: [5, 10, 20, 50, 100],
  CNY: [1, 5, 10, 20, 50, 100],
  HKD: [10, 20, 50, 100, 500, 1000],
  SGD: [2, 5, 10, 50, 100],
  TWD: [100, 200, 500, 1000, 2000],
  KRW: [1000, 5000, 10000, 50000],
  INR: [10, 20, 50, 100, 200, 500],
  THB: [20, 50, 100, 500, 1000],
  MYR: [1, 5, 10, 20, 50, 100],
  IDR: [1000, 2000, 5000, 10000, 50000, 100000],
  PHP: [20, 50, 100, 200, 500, 1000],
  VND: [10000, 20000, 50000, 100000, 200000, 500000],
  TRY: [5, 10, 20, 50, 100, 200],
  ZAR: [10, 20, 50, 100, 200],
  BRL: [2, 5, 10, 20, 50, 100, 200],
  MXN: [20, 50, 100, 200, 500, 1000],
  ARS: [100, 200, 500, 1000, 2000, 10000],
  CLP: [1000, 2000, 5000, 10000, 20000],
  COP: [1000, 2000, 5000, 10000, 20000, 50000, 100000],
  PEN: [10, 20, 50, 100, 200],
  SEK: [20, 50, 100, 200, 500, 1000],
  NOK: [50, 100, 200, 500, 1000],
  DKK: [50, 100, 200, 500, 1000],
  PLN: [10, 20, 50, 100, 200, 500],
  CZK: [100, 200, 500, 1000, 2000, 5000],
  HUF: [500, 1000, 2000, 5000, 10000, 20000],
  RON: [1, 5, 10, 50, 100, 200, 500],
  BGN: [2, 5, 10, 20, 50, 100],
  HRK: [10, 20, 50, 100, 200, 500, 1000],
  ISK: [500, 1000, 2000, 5000, 10000],
  RUB: [50, 100, 200, 500, 1000, 2000, 5000],
  UAH: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
  EGP: [1, 5, 10, 20, 50, 100, 200],
  MAD: [20, 50, 100, 200],
  AED: [5, 10, 20, 50, 100, 200, 500, 1000],
  SAR: [1, 5, 10, 50, 100, 500],
  ILS: [20, 50, 100, 200],
  NGN: [5, 10, 20, 50, 100, 200, 500, 1000],
  KES: [50, 100, 200, 500, 1000],
  PKR: [10, 20, 50, 100, 500, 1000, 5000],
  BDT: [2, 5, 10, 20, 50, 100, 500, 1000],
  LKR: [20, 50, 100, 500, 1000, 5000],
  MMK: [50, 100, 200, 500, 1000, 5000, 10000],
};

const MAX_DISPLAY = 6;

/**
 * Smart fallback: generate sensible "round" amounts based on magnitude.
 * E.g., for a currency worth ~0.007 USD, we'd show 100, 500, 1000, 5000, 10000, 50000
 */
function generateFallback(rateToUSD: number): number[] {
  // rateToUSD = how many USD per 1 unit of this currency
  // If 1 unit = 0.007 USD, a useful base denomination is ~1/rateToUSD rounded
  const valuePerUnit = rateToUSD;

  let base: number;
  if (valuePerUnit >= 0.5) {
    base = 1; // normal currencies like USD, EUR
  } else if (valuePerUnit >= 0.05) {
    base = 10;
  } else if (valuePerUnit >= 0.005) {
    base = 100;
  } else if (valuePerUnit >= 0.0005) {
    base = 1000;
  } else if (valuePerUnit >= 0.00005) {
    base = 10000;
  } else {
    base = 100000;
  }

  const multipliers = [1, 5, 10, 50, 100, 500];
  return multipliers.map((m) => m * base);
}

/**
 * Get sensible bill denominations for a currency.
 * Uses real banknote data when available, smart fallback otherwise.
 * @param code Currency code (e.g. "JPY")
 * @param rateToUSD Rate of 1 unit of this currency in USD (for fallback calculation)
 */
export function getDenominations(code: string, rateToUSD?: number): number[] {
  const known = DENOMINATIONS[code];
  if (known) {
    // Take up to MAX_DISPLAY, preferring the most common/useful ones
    return known.length <= MAX_DISPLAY ? known : known.slice(0, MAX_DISPLAY);
  }
  return generateFallback(rateToUSD ?? 1);
}
