const HOLD_DELAY = 300; // ms before slider activates

export interface SliderCallbacks {
  onUpdate: (value: number) => void;
  onCommit: (value: number) => void;
}

/**
 * Compute a smart range based on the current input value.
 * - value < 100 → 0–100
 * - otherwise → same digit range: 100–999, 1000–9999, etc.
 */
function getSmartRange(value: number): { min: number; max: number } {
  if (value < 100) return { min: 0, max: 100 };
  const digits = Math.floor(Math.log10(value));
  return { min: Math.pow(10, digits), max: Math.pow(10, digits + 1) - 1 };
}

/**
 * Generate evenly-spaced round notch values for a range.
 */
function generateNotches(min: number, max: number): number[] {
  const range = max - min;
  // Aim for ~5 intervals
  const rawStep = range / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.round(rawStep / magnitude) * magnitude || magnitude;

  const result: number[] = [min];
  let val = min + niceStep;
  while (val < max - niceStep * 0.3) {
    result.push(Math.round(val));
    val += niceStep;
  }
  result.push(max);
  return result;
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
  let sliderMax = 100;
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

  // Linear mapping — works well since the range always covers a single order of magnitude
  function valueToFraction(val: number): number {
    if (sliderMax <= sliderMin) return 0;
    return Math.max(0, Math.min(1, (val - sliderMin) / (sliderMax - sliderMin)));
  }

  function fractionToValue(frac: number): number {
    const raw = sliderMin + frac * (sliderMax - sliderMin);
    // Snap to nearest notch if close (within 4% of range)
    const snapThreshold = (sliderMax - sliderMin) * 0.04;
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

  function formatLabel(n: number): string {
    if (n >= 1_000_000) return `${n / 1_000_000}M`;
    if (n >= 1000) return `${n / 1000}k`;
    return String(n);
  }

  function renderNotches(): void {
    if (!sliderEl) return;
    const container = sliderEl.querySelector('.slider-notches') as HTMLElement;
    container.innerHTML = notches
      .map((n) => {
        const frac = valueToFraction(n);
        return `<span class="slider-notch" style="left:${frac * 100}%">${formatLabel(n)}</span>`;
      })
      .join('');
  }

  function showSlider(): void {
    currentValue = parseFloat(inputEl.value) || 0;
    const range = getSmartRange(currentValue);
    sliderMin = range.min;
    sliderMax = range.max;
    notches = generateNotches(sliderMin, sliderMax);

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
    // Round to sensible precision based on magnitude
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
      inputEl.blur();
      showSlider();
      updateFromPosition(startX);
    }, HOLD_DELAY);
  }

  function onTouchMove(e: TouchEvent): void {
    if (holdTimer) {
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
