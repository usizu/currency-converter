const HOLD_DELAY = 300; // ms before slider activates

export interface SliderCallbacks {
  onUpdate: (value: number) => void;
  onCommit: (value: number) => void;
}

/**
 * Compute a smart range based on the current input value.
 * Endpoints bridge into the adjacent order of magnitude so
 * you can slide to the boundary and "jump" up or down a digit.
 *
 * - value < 100       → 0–100
 * - value 100–999     → 99–1000
 * - value 1000–9999   → 999–10000
 * - etc.
 */
function getSmartRange(value: number): { min: number; max: number } {
  if (value < 100) return { min: 0, max: 100 };
  const digits = Math.floor(Math.log10(value));
  const low = Math.pow(10, digits) - 1;     // e.g. 99 for 100–999
  const high = Math.pow(10, digits + 1);    // e.g. 1000 for 100–999
  return { min: low, max: high };
}

/**
 * Generate evenly-spaced round notch values for a range.
 */
function generateNotches(min: number, max: number): number[] {
  const range = max - min;
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

export interface SliderHandle {
  show: () => void;
}

export function initSlider(
  inputEl: HTMLInputElement,
  containerEl: HTMLElement,
  callbacks: SliderCallbacks
): SliderHandle {
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
      <div class="slider-track-wrap">
        <div class="slider-track">
          <div class="slider-fill"></div>
        </div>
        <div class="slider-thumb">
          <svg class="thumb-dots" width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
            <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
            <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
            <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
          </svg>
        </div>
      </div>
      <div class="slider-notches"></div>
    `;
    return el;
  }

  // Linear mapping — works well since the range covers ~one order of magnitude
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
    // Clamp thumb so it doesn't extend outside the track at extremes
    // thumb is 1rem wide, track has ~0.5rem thumb half-width to keep inside
    thumb.style.left = `clamp(0.5rem, ${frac * 100}%, calc(100% - 0.5rem))`;
  }

  function formatLabel(n: number): string {
    n = Math.round(n);
    if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
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
    // Always round to integer — no floats
    currentValue = Math.round(currentValue);
    renderSlider();
    callbacks.onUpdate(currentValue);
  }

  // ===== Pointer events for tap vs hold detection =====

  function onPointerDown(e: PointerEvent): void {
    // Don't interfere if pointer is on the slider trigger button
    const target = e.target as HTMLElement;
    if (target.closest('.slider-trigger')) return;

    startX = e.clientX;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      inputEl.blur();
      showSlider();
      updateFromPosition(startX);
    }, HOLD_DELAY);
  }

  function onPointerMove(e: PointerEvent): void {
    if (holdTimer) {
      const dx = Math.abs(e.clientX - startX);
      if (dx > 10) {
        clearTimeout(holdTimer);
        holdTimer = null;
        return;
      }
    }
    if (active) {
      e.preventDefault();
      updateFromPosition(e.clientX);
    }
  }

  function onPointerUp(): void {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
      // Short tap — let the input focus naturally
      return;
    }
    if (active) {
      callbacks.onCommit(currentValue);
      hideSlider();
    }
  }

  // Attach to input
  inputEl.addEventListener('pointerdown', onPointerDown);
  inputEl.addEventListener('pointermove', onPointerMove);
  inputEl.addEventListener('pointerup', onPointerUp);
  inputEl.addEventListener('pointercancel', onPointerUp);

  // Slider-internal pointer events (for dragging after reveal)
  containerEl.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (active && target.closest('.amount-slider')) {
      e.preventDefault();
      e.stopPropagation();
      updateFromPosition(e.clientX);
    }
  });
  containerEl.addEventListener('pointermove', (e) => {
    if (active) {
      e.preventDefault();
      updateFromPosition(e.clientX);
    }
  });
  containerEl.addEventListener('pointerup', (e) => {
    const target = e.target as HTMLElement;
    if (active && target.closest('.amount-slider')) {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onCommit(currentValue);
      hideSlider();
    }
  });

  // Also handle touch events on slider to prevent scrolling while dragging
  containerEl.addEventListener('touchmove', (e) => {
    if (active) e.preventDefault();
  }, { passive: false });

  // Close slider if input gets focused via tap
  inputEl.addEventListener('focus', () => {
    if (active) hideSlider();
  });

  return {
    show() {
      inputEl.blur();
      showSlider();
      renderSlider();
    },
  };
}
