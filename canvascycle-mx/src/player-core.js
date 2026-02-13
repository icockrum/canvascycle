export class CanvasCyclePlayer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageData = null;
    this.data = null;
    this.paused = false;
    this.raf = 0;
    this.lastDraw = 0;
    this.targetFps = 60;
    this.loop = this.loop.bind(this);
  }

  loadFromData(jsonData) {
    this.data = normalizeData(jsonData);
    this.canvas.width = this.data.width;
    this.canvas.height = this.data.height;
    this.imageData = this.ctx.createImageData(this.data.width, this.data.height);
    this.lastDraw = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  async loadFromUrl(url) {
    const stamp = `t=${Date.now()}`;
    const glue = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${glue}${stamp}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${url}`);
    const json = await res.json();
    this.loadFromData(json);
  }

  pause() { this.paused = true; }
  resume() { this.paused = false; }
  stop() {
    this.paused = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.data = null;
    if (this.imageData) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  loop(now) {
    if (this.data && !this.paused) {
      const minDelta = 1000 / this.targetFps;
      if (now - this.lastDraw >= minDelta) {
        this.render(now);
        this.lastDraw = now;
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  render(now) {
    const colors = getCycledColors(this.data.colors, this.data.cycles, now);
    const src = this.data.pixels;
    const dst = this.imageData.data;
    for (let i = 0; i < src.length; i++) {
      const c = colors[src[i]] || [0, 0, 0];
      const di = i * 4;
      dst[di] = c[0];
      dst[di + 1] = c[1];
      dst[di + 2] = c[2];
      dst[di + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}

export function normalizeData(input) {
  return {
    filename: input.filename || 'untitled.json',
    width: input.width,
    height: input.height,
    pixels: input.pixels instanceof Uint8Array ? input.pixels : Uint8Array.from(input.pixels || []),
    colors: (input.colors || []).map((c) => [c[0], c[1], c[2]]),
    cycles: (input.cycles || []).map((cy) => ({
      low: clampNum(cy.low, 0, 255),
      high: clampNum(cy.high, 0, 255),
      rate: Number(cy.rate) || 0,
      reverse: clampNum(cy.reverse, 0, 2)
    }))
  };
}

export function getCycledColors(baseColors, cycles, timeNow) {
  const colors = baseColors.map((c) => [c[0], c[1], c[2]]);
  for (const cycle of cycles) {
    if (!cycle || !cycle.rate) continue;
    const low = Math.max(0, cycle.low | 0);
    const high = Math.min(255, cycle.high | 0);
    if (high <= low) continue;
    const size = high - low + 1;
    const amountRaw = Math.floor((timeNow / (1000 / (cycle.rate / 280))) % size);
    const amount = cycle.reverse === 2 ? (size - amountRaw) % size : amountRaw;
    if (!amount) continue;
    const segment = colors.slice(low, high + 1);
    for (let i = 0; i < size; i++) {
      colors[low + ((i + amount) % size)] = segment[i];
    }
  }
  return colors;
}

function clampNum(value, min, max) {
  const num = Number(value);
  if (Number.isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}
