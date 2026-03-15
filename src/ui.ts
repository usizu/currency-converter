import type { CachedRates, ConversionEntry } from './types';
import {
  getSelectedPair, setSelectedPair,
  getHistory, addToHistory, removeHistoryEntry, clearHistory,
  getLastAmount, setLastAmount,
  getHiddenCurrencies, setHiddenCurrencies,
  getFontSize, setFontSize,
  getShowCrypto, setShowCrypto,
  getTheme, setTheme,
} from './storage';
import { getRate, getBreakdown, convert, formatAmount } from './converter';
import { timeAgo } from './time';
import { fetchRates, fetchCurrencies } from './api';
import { currencyFlag } from './flags';
import { currencySymbol } from './symbols';
import { isFiat } from './fiat-codes';

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
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const fontSizeSlider = document.getElementById('font-size-slider') as HTMLInputElement;
const fontSizeLabel = document.getElementById('font-size-label') as HTMLSpanElement;
const cryptoToggle = document.getElementById('crypto-toggle') as HTMLInputElement;
const settingsSearch = document.getElementById('settings-search') as HTMLInputElement;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;

let currentRates: CachedRates | null = null;
let currencies: Record<string, string> = {};
let hiddenCurrencies: Set<string> = getHiddenCurrencies();
let showCrypto: boolean = getShowCrypto();
let debounceTimer: ReturnType<typeof setTimeout>;
let restoringFromHistory = false;
let lastSavedAmount = ''; // track to avoid duplicate history entries


const THEME_META: Record<string, string> = {
  midnight: '#13171f',
  ocean: '#0f1923',
  ember: '#1a1210',
  forest: '#0f1a14',
  daylight: '#f5f7fa',
};

function applyTheme(theme: string): void {
  document.documentElement.setAttribute('data-app-theme', theme);
  // Keep PicoCSS base mode in sync
  document.documentElement.setAttribute('data-theme', theme === 'daylight' ? 'light' : 'dark');
  // Update meta theme-color for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_META[theme] ?? THEME_META.midnight);
  themeSelect.value = theme;
}

function applyFontSize(pct: number): void {
  document.documentElement.style.setProperty('--app-font-size', `${pct}%`);
  fontSizeSlider.value = String(pct);
  fontSizeLabel.textContent = `${pct}%`;
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

// ===== Currency option text =====

function optionText(code: string, name: string): string {
  const flag = currencyFlag(code);
  return flag ? `${flag} ${code} — ${name}` : `${code} — ${name}`;
}

// ===== Populate selects =====

function populateCurrencies(data: Record<string, string>): void {
  currencies = data;
  const pair = getSelectedPair();
  const codes = Object.keys(data).sort().filter((c) => {
    if (hiddenCurrencies.has(c)) return false;
    if (!showCrypto && !isFiat(c)) return false;
    return true;
  });

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

/** Save to history on blur — only if the value actually changed */
function saveToHistory(): void {
  if (!currentRates) return;
  if (restoringFromHistory) return;

  const from = fromSelect.value;
  const to = toSelect.value;
  const raw = amountInput.value;
  const amount = parseFloat(raw);

  if (!amount || isNaN(amount) || amount <= 0) return;

  // Skip if same conversion was already saved
  const key = `${amount}|${from}|${to}`;
  if (key === lastSavedAmount) return;
  lastSavedAmount = key;

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
          <span class="history-right">
            <span class="time-text">${timeAgo(e.timestamp)}</span>
            <button class="history-delete" data-delete="${i}" aria-label="Delete">×</button>
          </span>
        </li>`;
      }
    )
    .join('');
}

function deleteHistoryEntry(index: number): void {
  removeHistoryEntry(index);
  renderHistory();
}

function onHistoryClick(e: Event): void {
  const target = e.target as HTMLElement;

  // Handle delete button
  const deleteBtn = target.closest('.history-delete') as HTMLElement | null;
  if (deleteBtn) {
    e.stopPropagation();
    const idx = parseInt(deleteBtn.dataset.delete ?? '', 10);
    deleteHistoryEntry(idx);
    return;
  }

  // Handle row click to restore
  const li = target.closest('.history-item') as HTMLElement | null;
  if (!li) return;
  const index = parseInt(li.dataset.index ?? '', 10);
  const entries = getHistory();
  const entry = entries[index];
  if (!entry) return;

  restoringFromHistory = true;
  lastSavedAmount = `${entry.amount}|${entry.from}|${entry.to}`;

  fromSelect.value = entry.from;
  toSelect.value = entry.to;
  amountInput.value = String(entry.amount);

  setSelectedPair({ from: entry.from, to: entry.to });
  setLastAmount(String(entry.amount));
  if (currentRates && currentRates.base !== entry.from) {
    refreshRates().then(() => { restoringFromHistory = false; });
  } else {
    updateDisplay();
    restoringFromHistory = false;
  }
}

// ===== Copy result =====

function copyResult(): void {
  const text = resultValue.textContent?.trim();
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.classList.add('copied');
    copyBtn.textContent = '✓';
    setTimeout(() => {
      copyBtn.classList.remove('copied');
      copyBtn.textContent = '⧉';
    }, 1200);
  });
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
  ratesPill.innerHTML = '<span class="spinner">↻</span> updating…';
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
  updateSymbolPrefix();

  if (currentRates && currentRates.base !== pair.from) {
    refreshRates();
  } else {
    updateDisplay();
  }
}

// ===== Settings panel =====

function openSettings(): void {
  settingsSearch.value = '';
  cryptoToggle.checked = showCrypto;
  themeSelect.value = getTheme();
  renderSettings();
  settingsPanel.hidden = false;
}

function closeSettings(): void {
  settingsPanel.hidden = true;
  // Re-populate selects with new filter
  populateCurrencies(currencies);
  updateDisplay();
}

function renderSettings(filter = ''): void {
  const query = filter.toLowerCase().trim();
  const codes = Object.keys(currencies).sort().filter((code) => {
    // Hide crypto unless toggle is on
    if (!showCrypto && !isFiat(code)) return false;
    // Apply search filter
    if (query) {
      const name = currencies[code].toLowerCase();
      const codeLower = code.toLowerCase();
      return codeLower.includes(query) || name.includes(query);
    }
    return true;
  });
  settingsList.innerHTML = codes
    .map((code) => {
      const flag = currencyFlag(code);
      const checked = !hiddenCurrencies.has(code) ? 'checked' : '';
      const tag = isFiat(code) ? '' : ' <span class="crypto-tag">crypto</span>';
      return `<li>
        <input type="checkbox" id="cur-${code}" value="${code}" ${checked} />
        <label for="cur-${code}" class="currency-label">${flag} ${code} — ${currencies[code]}${tag}</label>
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
  // Apply saved theme & font size
  applyTheme(getTheme());
  applyFontSize(getFontSize());

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
  amountInput.addEventListener('blur', saveToHistory);

  copyBtn.addEventListener('click', copyResult);
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
  cryptoToggle.addEventListener('change', () => {
    showCrypto = cryptoToggle.checked;
    setShowCrypto(showCrypto);
    renderSettings(settingsSearch.value);
  });
  settingsSearch.addEventListener('input', () => {
    renderSettings(settingsSearch.value);
  });
  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value;
    applyTheme(theme);
    setTheme(theme);
  });
  fontSizeSlider.addEventListener('input', () => {
    const pct = parseInt(fontSizeSlider.value, 10);
    applyFontSize(pct);
    setFontSize(pct);
  });

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

  ratesPill.removeAttribute('aria-busy');
  updatePill();
  updateDisplay();
  renderHistory();

  setInterval(refreshRates, 30 * 60 * 1000);
  setInterval(updatePill, 60 * 1000);
}
