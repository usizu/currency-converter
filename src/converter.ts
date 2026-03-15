import type { BreakdownItem } from './types';

const BREAKDOWN_AMOUNTS = [1, 5, 10, 20, 50, 100];

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

export function getBreakdown(rate: number): BreakdownItem[] {
  return BREAKDOWN_AMOUNTS.map((amount) => ({
    amount,
    result: convert(amount, rate),
  }));
}

export function formatAmount(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const decimals = value < 1 ? 4 : 2;
  return value.toFixed(decimals);
}
