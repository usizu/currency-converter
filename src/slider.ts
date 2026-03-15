import { getSliderNotches } from './denominations';

const HOLD_DELAY = 300; // ms before slider activates

export interface SliderCallbacks {
  onUpdate: (value: number) => void;
  onCommit: (value: number) => void;
  getCurrencyCode: () => string;
  getRateToUSD: () => number | undefined;
}

export function initSlider(
  inputEl: HTMLInputElement,
  containerEl: HTMLElement,
  callbacks: SliderCallbacks
): void {
  let sliderEl: HTMLDivElement | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let notches: number[] = [];
  let sliderMin = 0;
  let sliderMax = 1000;
  let currentValue = 0;
  let startX = 0;
  let trackWidth = 0;

  function buildSlider(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'amount-slider';
    el.innerHTML = `
      <div class="slider-track">
        <div class="slider-fill"></div>
        <div class="slider-thumb"></div>
      </div>
      <div class="slider-notches"></div>
    `;
    return el;
  }

  // Logarithmic mapping: spreads small values and compresses large ones
  // Uses log(1 + x) to handle 0 gracefully
  function valueToFraction(val: number): number {
    if (sliderMax <= sliderMin) return 0;
    const clamped = Math.max(sliderMin, Math.min(sliderMax, val));
    const logMin = Math.log1p(sliderMin);
    const logMax = Math.log1p(sliderMax);
    const logVal = Math.log1p(clamped);
    return (logVal - logMin) / (logMax - logMin);
  }

  function fractionToValue(frac: number): number {
    const logMin = Math.log1p(sliderMin);
    const logMax = Math.log1p(sliderMax);
    const logVal = logMin + frac * (logMax - logMin);
    const raw = Math.expm1(logVal);
    // Snap to nearest notch if close (within 3% of range in log space)
    const snapThreshold = (sliderMax - sliderMin) * 0.03;
    let closest = raw;
    let closestDist = Infinity;
    for (const n of notches) {
      const dist = Math.abs(raw - n);
      if (dist < closestDist && dist < snapThreshold) {
        closest = n;
        closestDist = dist;
      }
    }
    return closest;
  }

  function renderSlider(): void {
    if (!sliderEl) return;
    const frac = valueToFraction(currentValue);
    const fill = sliderEl.querySelector('.slider-fill') as HTMLElement;
    const thumb = sliderEl.querySelector('.slider-thumb') as HTMLElement;
    fill.style.width = `${frac * 100}%`;
    thumb.style.left = `${frac * 100}%`;
  }

  function renderNotches(): void {
    if (!sliderEl) return;
    const container = sliderEl.querySelector('.slider-notches') as HTMLElement;
    // Show a subset of notches as labels
    const display = notches.filter((n) => n > 0).slice(0, 8);
    container.innerHTML = display
      .map((n) => {
        const frac = valueToFraction(n);
        const label = n >= 1000 ? `${n / 1000}k` : String(n);
        return `<span class="slider-notch" style="left:${frac * 100}%">${label}</span>`;
      })
      .join('');
  }

  function showSlider(): void {
    const code = callbacks.getCurrencyCode();
    const rate = callbacks.getRateToUSD();
    notches = getSliderNotches(code, rate);
    sliderMin = 0;
    sliderMax = notches[notches.length - 1];
    currentValue = parseFloat(inputEl.value) || 0;

    if (!sliderEl) {
      sliderEl = buildSlider();
      containerEl.appendChild(sliderEl);
    }
    sliderEl.classList.add('visible');
    renderNotches();
    renderSlider();
    active = true;
  }

  function hideSlider(): void {
    active = false;
    if (sliderEl) {
      sliderEl.classList.remove('visible');
    }
  }

  function updateFromPosition(clientX: number): void {
    if (!sliderEl) return;
    const track = sliderEl.querySelector('.slider-track') as HTMLElement;
    const rect = track.getBoundingClientRect();
    trackWidth = rect.width;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / trackWidth));
    currentValue = fractionToValue(frac);
    // Round to sensible precision
    if (currentValue >= 100) {
      currentValue = Math.round(currentValue);
    } else if (currentValue >= 1) {
      currentValue = Math.round(currentValue * 10) / 10;
    } else {
      currentValue = Math.round(currentValue * 100) / 100;
    }
    renderSlider();
    callbacks.onUpdate(currentValue);
  }

  // ===== Touch events on the input =====

  function onTouchStart(e: TouchEvent): void {
    // Don't interfere if input is already focused (keyboard mode)
    if (document.activeElement === inputEl) return;

    startX = e.touches[0].clientX;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      // Blur the input to dismiss any keyboard that may have appeared
      inputEl.blur();
      showSlider();
      updateFromPosition(startX);
    }, HOLD_DELAY);
  }

  function onTouchMove(e: TouchEvent): void {
    if (holdTimer) {
      // If moved too much before hold triggered, cancel (it's a scroll)
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dx > 10) {
        clearTimeout(holdTimer);
        holdTimer = null;
        return;
      }
    }
    if (active) {
      e.preventDefault();
      updateFromPosition(e.touches[0].clientX);
    }
  }

  function onTouchEnd(): void {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      // Short tap — let the normal focus happen
      inputEl.focus();
      return;
    }
    if (active) {
      callbacks.onCommit(currentValue);
      hideSlider();
    }
  }

  // ===== Slider-internal touch (for dragging after reveal) =====

  function onSliderTouch(e: TouchEvent): void {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromPosition(e.touches[0].clientX);
  }

  function onSliderTouchEnd(e: TouchEvent): void {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    callbacks.onCommit(currentValue);
    hideSlider();
  }

  // Attach to input
  inputEl.addEventListener('touchstart', onTouchStart, { passive: false });
  inputEl.addEventListener('touchmove', onTouchMove, { passive: false });
  inputEl.addEventListener('touchend', onTouchEnd);

  // Attach to slider (for continued dragging)
  containerEl.addEventListener('touchstart', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.amount-slider')) {
      onSliderTouch(e);
    }
  }, { passive: false });
  containerEl.addEventListener('touchmove', (e) => {
    if (active) {
      e.preventDefault();
      updateFromPosition(e.touches[0].clientX);
    }
  }, { passive: false });
  containerEl.addEventListener('touchend', (e) => {
    if (active) {
      onSliderTouchEnd(e);
    }
  });

  // Close slider if input gets focused via tap
  inputEl.addEventListener('focus', () => {
    if (active) hideSlider();
  });
}
