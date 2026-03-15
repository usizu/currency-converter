import tippy, { type Instance } from 'tippy.js';
import type { CachedRates, ConversionEntry } from './types';
import {
  getSelectedPair, setSelectedPair,
  getHistory, addToHistory, clearHistory,
  getLastAmount, setLastAmount,
} from './storage';
import { getRate, getBreakdown, convert, formatAmount } from './converter';
import { timeAgo } from './time';
import { fetchRates, fetchCurrencies } from './api';

// DOM elements
const fromSelect = document.getElementById('from-currency') as HTMLSelectElement;
const toSelect = document.getElementById('to-currency') as HTMLSelectElement;
const amountInput = document.getElementById('amount-input') as HTMLInputElement;
const resultValue = document.getElementById('result-value') as HTMLSpanElement;
const swapBtn = document.getElementById('swap-btn') as HTMLButtonElement;
const ratesPill = document.getElementById('rates-pill') as HTMLSpanElement;
const breakdownFromHeader = document.getElementById('breakdown-from-header') as HTMLTableCellElement;
const breakdownToHeader = document.getElementById('breakdown-to-header') as HTMLTableCellElement;
const breakdownBody = document.getElementById('breakdown-body') as HTMLTableSectionElement;
const historyList = document.getElementById('history-list') as HTMLUListElement;
const clearHistoryBtn = document.getElementById('clear-history-btn') as HTMLButtonElement;
const errorBanner = document.getElementById('error-banner') as HTMLDivElement;
const errorMessage = document.getElementById('error-message') as HTMLSpanElement;
const errorDismiss = document.getElementById('error-dismiss') as HTMLButtonElement;

let currentRates: CachedRates | null = null;
let currencies: Record<string, string> = {};
let debounceTimer: ReturnType<typeof setTimeout>;
let restoringFromHistory = false; // guard against history pollution

// Tippy instances
let pillTip: Instance;
let fromTip: Instance;
let toTip: Instance;

function initTooltips() {
  pillTip = tippy(ratesPill, { content: '', placement: 'bottom' }) as unknown as Instance;
  fromTip = tippy(fromSelect, { content: '', placement: 'top', trigger: 'focus' }) as unknown as Instance;
  toTip = tippy(toSelect, { content: '', placement: 'top', trigger: 'focus' }) as unknown as Instance;
}

function showError(msg: string): void {
  errorMessage.textContent = msg;
  errorBanner.hidden = false;
}

function hideError(): void {
  errorBanner.hidden = true;
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

function updateDisplay(): void {
  if (!currentRates) return;
  const from = fromSelect.value;
  const to = toSelect.value;
  const amount = parseFloat(amountInput.value);
  const rate = getRate(currentRates.rates, from, to);

  // Always update breakdown
  updateBreakdown(rate, from);

  if (!amount || isNaN(amount) || amount <= 0) {
    resultValue.textContent = '—';
    return;
  }

  const result = convert(amount, rate);
  resultValue.textContent = `${formatAmount(result)} ${to}`;
}

/** Called on user input — updates display AND saves to history + LS */
function onAmountInput(): void {
  updateDisplay();

  if (!currentRates) return;
  const from = fromSelect.value;
  const to = toSelect.value;
  const amount = parseFloat(amountInput.value);

  // Save amount to LS
  setLastAmount(amountInput.value);

  if (!amount || isNaN(amount) || amount <= 0) return;

  // Don't add to history if we're restoring from a history click
  if (restoringFromHistory) return;

  const rate = getRate(currentRates.rates, from, to);
  const result = convert(amount, rate);
  addToHistory({ from, to, amount, result, rate, timestamp: Date.now() });
  renderHistory();
}

function updateBreakdown(rate: number, from: string): void {
  const to = toSelect.value;
  breakdownFromHeader.textContent = from;
  breakdownToHeader.textContent = to;
  if (!currentRates) return;
  const items = getBreakdown(rate, from, currentRates.rates);
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
      (e: ConversionEntry, i: number) =>
        `<li data-index="${i}" class="history-item">
          <span class="conversion-text">${formatAmount(e.amount)} ${e.from} → ${formatAmount(e.result)} ${e.to}</span>
          <span class="time-text">${timeAgo(e.timestamp)}</span>
        </li>`
    )
    .join('');
}

function onHistoryClick(e: Event): void {
  const li = (e.target as HTMLElement).closest('.history-item') as HTMLElement | null;
  if (!li) return;
  const index = parseInt(li.dataset.index ?? '', 10);
  const entries = getHistory();
  const entry = entries[index];
  if (!entry) return;

  // Restore the conversion without polluting history
  restoringFromHistory = true;

  fromSelect.value = entry.from;
  toSelect.value = entry.to;
  amountInput.value = String(entry.amount);

  setSelectedPair({ from: entry.from, to: entry.to });
  setLastAmount(String(entry.amount));
  updateCurrencyTooltip(fromSelect);
  updateCurrencyTooltip(toSelect);

  // May need to fetch rates for new base
  if (currentRates && currentRates.base !== entry.from) {
    refreshRates().then(() => {
      restoringFromHistory = false;
    });
  } else {
    updateDisplay();
    restoringFromHistory = false;
  }
}

function updatePill(): void {
  if (!currentRates) return;
  const ago = timeAgo(currentRates.fetchedAt);
  ratesPill.innerHTML = `↻ ${ago}`;
  pillTip.setContent(
    `ECB rates from ${currentRates.date}\nFetched: ${new Date(currentRates.fetchedAt).toLocaleString()}`
  );

  const stale = Date.now() - currentRates.fetchedAt > 2 * 60 * 60 * 1000;
  ratesPill.setAttribute('data-stale', String(stale));
}

async function refreshRates(): Promise<void> {
  ratesPill.innerHTML = '↻ updating…';
  ratesPill.setAttribute('aria-busy', 'true');
  try {
    currentRates = await fetchRates(fromSelect.value);
    hideError();
    updatePill();
    updateDisplay();
  } catch (err) {
    console.error('Failed to refresh rates:', err);
    showError(`Failed to refresh rates: ${err instanceof Error ? err.message : err}`);
    updatePill();
  } finally {
    ratesPill.removeAttribute('aria-busy');
  }
}

function onPairChange(): void {
  const pair = { from: fromSelect.value, to: toSelect.value };
  setSelectedPair(pair);
  updateCurrencyTooltip(fromSelect);
  updateCurrencyTooltip(toSelect);

  if (currentRates && currentRates.base !== pair.from) {
    refreshRates();
  } else {
    updateDisplay();
  }
}

export async function initUI(): Promise<void> {
  initTooltips();

  // Restore last amount
  const savedAmount = getLastAmount();
  if (savedAmount) amountInput.value = savedAmount;

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
    debounceTimer = setTimeout(onAmountInput, 150);
  });

  ratesPill.addEventListener('click', refreshRates);
  errorDismiss.addEventListener('click', hideError);
  clearHistoryBtn.addEventListener('click', () => {
    clearHistory();
    renderHistory();
  });
  historyList.addEventListener('click', onHistoryClick);

  // Load currencies
  try {
    const data = await fetchCurrencies();
    populateCurrencies(data);
  } catch (err) {
    console.error('Failed to load currencies:', err);
    showError(`Failed to load currencies: ${err instanceof Error ? err.message : err}`);
  }

  // Load rates
  try {
    currentRates = await fetchRates(fromSelect.value);
    hideError();
  } catch (err) {
    console.error('Failed to load rates:', err);
    showError(`Failed to load rates: ${err instanceof Error ? err.message : err}`);
  }

  updatePill();
  updateDisplay();
  renderHistory();

  // Auto-refresh every 30 minutes
  setInterval(refreshRates, 30 * 60 * 1000);

  // Update pill every minute
  setInterval(updatePill, 60 * 1000);
}
