import type { BreakdownItem } from './types';
import { getDenominations } from './denominations';

export function convert(amount: number, rate: number): number {
  return amount * rate;
}

export function getRate(
  rates: Record<string, number>,
  from: string,
  to: string
): number {
  const fromRate = rates[from] ?? 1;
  const toRate = rates[to] ?? 1;
  return toRate / fromRate;
}

export function getBreakdown(
  rate: number,
  fromCode: string,
  rates: Record<string, number>,
): BreakdownItem[] {
  // Estimate USD value of 1 unit for smart fallback
  const usdRate = rates['USD'] ?? 1;
  const fromRate = rates[fromCode] ?? 1;
  const rateToUSD = usdRate / fromRate;

  const denoms = getDenominations(fromCode, rateToUSD);
  return denoms.map((amount) => ({
    amount,
    result: convert(amount, rate),
  }));
}

export function formatAmount(value: number): string {
  const decimals = value < 1 ? 4 : 2;
  // Round first to avoid floating-point artifacts (e.g. 23.6500000001)
  const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  if (rounded >= 1000) {
    return rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return rounded.toFixed(decimals);
}
