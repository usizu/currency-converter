import tippy, { type Instance } from 'tippy.js';
import type { CachedRates, ConversionEntry } from './types';
import {
  getSelectedPair, setSelectedPair,
  getHistory, addToHistory, clearHistory,
  getLastAmount, setLastAmount,
  getHiddenCurrencies, setHiddenCurrencies,
} from './storage';
import { getRate, getBreakdown, convert, formatAmount } from './converter';
import { timeAgo } from './time';
import { fetchRates, fetchCurrencies } from './api';
import { currencyFlag } from './flags';
import { currencySymbol } from './symbols';

// DOM refs
const fromSelect = document.getElementById('from-currency') as HTMLSelectElement;
const toSelect = document.getElementById('to-currency') as HTMLSelectElement;
const amountInput = document.getElementById('amount-input') as HTMLInputElement;
const resultValue = document.getElementById('result-value') as HTMLSpanElement;
const fromSymbol = document.getElementById('from-symbol') as HTMLSpanElement;
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
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsPanel = document.getElementById('settings-panel') as HTMLDivElement;
const settingsClose = document.getElementById('settings-close') as HTMLButtonElement;
const settingsAll = document.getElementById('settings-all') as HTMLButtonElement;
const settingsNone = document.getElementById('settings-none') as HTMLButtonElement;
const settingsList = document.getElementById('settings-list') as HTMLUListElement;

let currentRates: CachedRates | null = null;
let currencies: Record<string, string> = {};
let hiddenCurrencies: Set<string> = getHiddenCurrencies();
let debounceTimer: ReturnType<typeof setTimeout>;
let restoringFromHistory = false;

// Tippy instances
let fromTip: Instance;
let toTip: Instance;

function initTooltips() {
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

// ===== Currency symbol prefix =====

function updateSymbolPrefix(): void {
  const sym = currencySymbol(fromSelect.value);
  fromSymbol.textContent = sym;
  // Dynamically set padding based on symbol width
  requestAnimationFrame(() => {
    const w = fromSymbol.offsetWidth;
    amountInput.style.setProperty('--symbol-pad', `${w + 12}px`);
    amountInput.style.paddingLeft = `var(--symbol-pad)`;
  });
}

// ===== Currency tooltips =====

function updateCurrencyTooltip(el: HTMLSelectElement) {
  const code = el.value;
  const flag = currencyFlag(code);
  const name = currencies[code] ?? code;
  const tip = el === fromSelect ? fromTip : toTip;
  tip.setContent(`${flag} ${code} — ${name}`);
}

// ===== Currency option text =====

function optionText(code: string, name: string): string {
  const flag = currencyFlag(code);
  return flag ? `${flag} ${code} — ${name}` : `${code} — ${name}`;
}

// ===== Populate selects =====

function populateCurrencies(data: Record<string, string>): void {
  currencies = data;
  const pair = getSelectedPair();
  const codes = Object.keys(data).sort().filter((c) => !hiddenCurrencies.has(c));

  [fromSelect, toSelect].forEach((select, i) => {
    const prev = select.value;
    select.innerHTML = '';
    const selected = prev || (i === 0 ? pair.from : pair.to);
    codes.forEach((code) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = optionText(code, data[code]);
      if (code === selected) opt.selected = true;
      select.appendChild(opt);
    });
    // Ensure a selection exists even if previous was hidden
    if (!select.value && codes.length) select.value = codes[0];
  });

  updateCurrencyTooltip(fromSelect);
  updateCurrencyTooltip(toSelect);
  updateSymbolPrefix();
}

// ===== Display =====

function updateDisplay(): void {
  if (!currentRates) return;
  const from = fromSelect.value;
  const to = toSelect.value;
  const amount = parseFloat(amountInput.value);
  const rate = getRate(currentRates.rates, from, to);

  updateBreakdown(rate, from);
  updateSymbolPrefix();

  if (!amount || isNaN(amount) || amount <= 0) {
    resultValue.textContent = '—';
    return;
  }

  const result = convert(amount, rate);
  const sym = currencySymbol(to);
  resultValue.textContent = `${sym} ${formatAmount(result)}`;
}

function onAmountInput(): void {
  updateDisplay();
  setLastAmount(amountInput.value);
}

/** Save to history on blur (not every keystroke) */
function onAmountBlur(): void {
  if (!currentRates) return;
  if (restoringFromHistory) return;

  const from = fromSelect.value;
  const to = toSelect.value;
  const amount = parseFloat(amountInput.value);

  if (!amount || isNaN(amount) || amount <= 0) return;

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

// ===== History =====

function renderHistory(): void {
  const entries = getHistory();
  if (entries.length === 0) {
    historyList.innerHTML = '<li class="empty-state">No conversions yet</li>';
    return;
  }
  historyList.innerHTML = entries
    .map(
      (e: ConversionEntry, i: number) => {
        const ff = currencyFlag(e.from);
        const tf = currencyFlag(e.to);
        return `<li data-index="${i}" class="history-item">
          <span class="conversion-text">${ff} ${formatAmount(e.amount)} ${e.from} → ${tf} ${formatAmount(e.result)} ${e.to}</span>
          <span class="time-text">${timeAgo(e.timestamp)}</span>
        </li>`;
      }
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

  restoringFromHistory = true;

  fromSelect.value = entry.from;
  toSelect.value = entry.to;
  amountInput.value = String(entry.amount);

  setSelectedPair({ from: entry.from, to: entry.to });
  setLastAmount(String(entry.amount));
  updateCurrencyTooltip(fromSelect);
  updateCurrencyTooltip(toSelect);

  if (currentRates && currentRates.base !== entry.from) {
    refreshRates().then(() => { restoringFromHistory = false; });
  } else {
    updateDisplay();
    restoringFromHistory = false;
  }
}

// ===== Pill & refresh =====

function updatePill(): void {
  if (!currentRates) return;
  const ago = timeAgo(currentRates.fetchedAt);
  ratesPill.innerHTML = `↻ ${ago}`;
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
  updateSymbolPrefix();

  if (currentRates && currentRates.base !== pair.from) {
    refreshRates();
  } else {
    updateDisplay();
  }
}

// ===== Settings panel =====

function openSettings(): void {
  renderSettings();
  settingsPanel.hidden = false;
}

function closeSettings(): void {
  settingsPanel.hidden = true;
  // Re-populate selects with new filter
  populateCurrencies(currencies);
  updateDisplay();
}

function renderSettings(): void {
  const codes = Object.keys(currencies).sort();
  settingsList.innerHTML = codes
    .map((code) => {
      const flag = currencyFlag(code);
      const checked = !hiddenCurrencies.has(code) ? 'checked' : '';
      return `<li>
        <input type="checkbox" id="cur-${code}" value="${code}" ${checked} />
        <label for="cur-${code}" class="currency-label">${flag} ${code} — ${currencies[code]}</label>
      </li>`;
    })
    .join('');
}

function onSettingsChange(e: Event): void {
  const target = e.target as HTMLInputElement;
  if (target.type !== 'checkbox') return;
  const code = target.value;
  if (target.checked) {
    hiddenCurrencies.delete(code);
  } else {
    hiddenCurrencies.add(code);
  }
  setHiddenCurrencies(hiddenCurrencies);
}

function settingsSelectAll(): void {
  hiddenCurrencies.clear();
  setHiddenCurrencies(hiddenCurrencies);
  renderSettings();
}

function settingsClearAll(): void {
  // Keep the currently selected pair visible
  const pair = getSelectedPair();
  const allCodes = Object.keys(currencies);
  hiddenCurrencies = new Set(allCodes.filter((c) => c !== pair.from && c !== pair.to));
  setHiddenCurrencies(hiddenCurrencies);
  renderSettings();
}

// ===== Init =====

export async function initUI(): Promise<void> {
  initTooltips();

  const savedAmount = getLastAmount();
  if (savedAmount) amountInput.value = savedAmount;

  // Events
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
  amountInput.addEventListener('blur', onAmountBlur);

  ratesPill.addEventListener('click', refreshRates);
  errorDismiss.addEventListener('click', hideError);
  clearHistoryBtn.addEventListener('click', () => {
    clearHistory();
    renderHistory();
  });
  historyList.addEventListener('click', onHistoryClick);

  // Settings
  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) closeSettings();
  });
  settingsList.addEventListener('change', onSettingsChange);
  settingsAll.addEventListener('click', settingsSelectAll);
  settingsNone.addEventListener('click', settingsClearAll);

  // Load data
  try {
    const data = await fetchCurrencies();
    populateCurrencies(data);
  } catch (err) {
    console.error('Failed to load currencies:', err);
    showError(`Failed to load currencies: ${err instanceof Error ? err.message : err}`);
  }

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

  setInterval(refreshRates, 30 * 60 * 1000);
  setInterval(updatePill, 60 * 1000);
}
