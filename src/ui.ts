import tippy, { type Instance } from 'tippy.js';
import type { CachedRates, ConversionEntry } from './types';
import { getSelectedPair, setSelectedPair, getHistory, addToHistory, clearHistory } from './storage';
import { getRate, getBreakdown, convert, formatAmount } from './converter';
import { timeAgo } from './time';
import { fetchRates, fetchCurrencies } from './api';

// DOM elements
const fromSelect = document.getElementById('from-currency') as HTMLSelectElement;
const toSelect = document.getElementById('to-currency') as HTMLSelectElement;
const amountInput = document.getElementById('amount-input') as HTMLInputElement;
const resultValue = document.getElementById('result-value') as HTMLSpanElement;
const swapBtn = document.getElementById('swap-btn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const ratesPill = document.getElementById('rates-pill') as HTMLSpanElement;
const breakdownFromHeader = document.getElementById('breakdown-from-header') as HTMLTableCellElement;
const breakdownToHeader = document.getElementById('breakdown-to-header') as HTMLTableCellElement;
const breakdownBody = document.getElementById('breakdown-body') as HTMLTableSectionElement;
const historyList = document.getElementById('history-list') as HTMLUListElement;
const clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;

let currentRates: CachedRates | null = null;
let currencies: Record<string, string> = {};
let debounceTimer: ReturnType<typeof setTimeout>;

// Tippy instances
let pillTip: Instance;
let fromTip: Instance;
let toTip: Instance;

function initTooltips() {
  pillTip = tippy(ratesPill, { content: '', placement: 'bottom' }) as unknown as Instance;
  fromTip = tippy(fromSelect, { content: '', placement: 'top', trigger: 'focus' }) as unknown as Instance;
  toTip = tippy(toSelect, { content: '', placement: 'top', trigger: 'focus' }) as unknown as Instance;
}

function updateCurrencyTooltip(el: HTMLSelectElement) {
  const code = el.value;
  const name = currencies[code] ?? code;
  const tip = el === fromSelect ? fromTip : toTip;
  tip.setContent(`${code} — ${name}`);
}

export function populateCurrencies(data: Record<string, string>): void {
  currencies = data;
  const pair = getSelectedPair();
  const codes = Object.keys(data).sort();

  [fromSelect, toSelect].forEach((select, i) => {
    select.innerHTML = '';
    const selected = i === 0 ? pair.from : pair.to;
    codes.forEach((code) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} — ${data[code]}`;
      if (code === selected) opt.selected = true;
      select.appendChild(opt);
    });
  });

  updateCurrencyTooltip(fromSelect);
  updateCurrencyTooltip(toSelect);
}

function updateResult(): void {
  if (!currentRates) return;
  const from = fromSelect.value;
  const to = toSelect.value;
  const amount = parseFloat(amountInput.value);
  const rate = getRate(currentRates.rates, from, to);

  if (!amount || isNaN(amount) || amount <= 0) {
    resultValue.textContent = '—';
    updateBreakdown(rate, from, to);
    return;
  }

  const result = convert(amount, rate);
  resultValue.textContent = `${formatAmount(result)} ${to}`;
  updateBreakdown(rate, from, to);

  // Add to history
  addToHistory({
    from,
    to,
    amount,
    result,
    rate,
    timestamp: Date.now(),
  });
  renderHistory();
}

function updateBreakdown(rate: number, from: string, to: string): void {
  breakdownFromHeader.textContent = from;
  breakdownToHeader.textContent = to;
  const items = getBreakdown(rate);
  breakdownBody.innerHTML = items
    .map(
      (item) =>
        `<tr><td>${formatAmount(item.amount)} ${from}</td><td>${formatAmount(item.result)} ${to}</td></tr>`
    )
    .join('');
}

function renderHistory(): void {
  const entries = getHistory();
  if (entries.length === 0) {
    historyList.innerHTML = '<li class="empty-state">No conversions yet</li>';
    return;
  }
  historyList.innerHTML = entries
    .map(
      (e: ConversionEntry) =>
        `<li>
          <span class="conversion-text">${formatAmount(e.amount)} ${e.from} → ${formatAmount(e.result)} ${e.to}</span>
          <span class="time-text">${timeAgo(e.timestamp)}</span>
        </li>`
    )
    .join('');
}

function updatePill(): void {
  if (!currentRates) return;
  const ago = timeAgo(currentRates.fetchedAt);
  ratesPill.textContent = `Rates: ${ago}`;
  pillTip.setContent(
    `ECB rates from ${currentRates.date}\nFetched: ${new Date(currentRates.fetchedAt).toLocaleString()}`
  );

  // Mark as stale if >2 hours old
  const stale = Date.now() - currentRates.fetchedAt > 2 * 60 * 60 * 1000;
  ratesPill.setAttribute('data-stale', String(stale));
}

async function refreshRates(): Promise<void> {
  refreshBtn.setAttribute('aria-busy', 'true');
  refreshBtn.textContent = 'Refreshing...';
  try {
    currentRates = await fetchRates(fromSelect.value);
    updatePill();
    updateResult();
  } catch (err) {
    console.error('Failed to refresh rates:', err);
  } finally {
    refreshBtn.removeAttribute('aria-busy');
    refreshBtn.textContent = '↻ Refresh Rates';
  }
}

function onPairChange(): void {
  const pair = { from: fromSelect.value, to: toSelect.value };
  setSelectedPair(pair);
  updateCurrencyTooltip(fromSelect);
  updateCurrencyTooltip(toSelect);

  // If base currency changed, re-fetch rates
  if (currentRates && currentRates.base !== pair.from) {
    refreshRates();
  } else {
    updateResult();
  }
}

export async function initUI(): Promise<void> {
  initTooltips();

  // Bind events
  fromSelect.addEventListener('change', onPairChange);
  toSelect.addEventListener('change', onPairChange);
  swapBtn.addEventListener('click', () => {
    const from = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = from;
    onPairChange();
  });

  amountInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateResult, 150);
  });

  refreshBtn.addEventListener('click', refreshRates);
  clearHistoryBtn.addEventListener('click', () => {
    clearHistory();
    renderHistory();
  });

  // Load currencies
  try {
    const data = await fetchCurrencies();
    populateCurrencies(data);
  } catch (err) {
    console.error('Failed to load currencies:', err);
  }

  // Load rates
  try {
    currentRates = await fetchRates(fromSelect.value);
  } catch (err) {
    console.error('Failed to load rates:', err);
  }

  updatePill();
  updateResult();
  renderHistory();

  // Auto-refresh every 30 minutes
  setInterval(refreshRates, 30 * 60 * 1000);

  // Update pill every minute
  setInterval(updatePill, 60 * 1000);
}
