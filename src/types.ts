export interface CurrencyPair {
  from: string;
  to: string;
}

export interface CachedRates {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

export interface ConversionEntry {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
  timestamp: number;
}

export interface BreakdownItem {
  amount: number;
  result: number;
}
