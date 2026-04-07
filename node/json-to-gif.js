#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.log(
    'Usage: node node/json-to-gif.js <input.json> <output.gif> [--fps=30] [--max-frames=1200]',
  );
}

function parseArgs(argv) {
  const positional = [];
  const options = { fps: 30, maxFrames: 1200 };
  for (const arg of argv) {
    if (arg.startsWith('--fps=')) options.fps = Number(arg.slice(6));
    else if (arg.startsWith('--max-frames=')) options.maxFrames = Number(arg.slice(13));
    else if (arg === '--help' || arg === '-h') options.help = true;
    else positional.push(arg);
  }
  return { positional, options };
}

function gcd(a, b) { let x = Math.abs(a), y = Math.abs(b); while (y) [x, y] = [y, x % y]; return x; }
function lcm(a, b) { return !a || !b ? 0 : Math.abs((a / gcd(a, b)) * b); }

function normalizeData(input) {
  return {
    width: Number(input.width) || 0,
    height: Number(input.height) || 0,
    pixels: input.pixels instanceof Uint8Array ? input.pixels : Uint8Array.from(input.pixels || []),
    colors: (input.colors || []).map((c) => [c[0] | 0, c[1] | 0, c[2] | 0]),
    cycles: (input.cycles || []).map((cy) => ({
      low: Math.max(0, Math.min(255, Number(cy.low) | 0)),
      high: Math.max(0, Math.min(255, Number(cy.high) | 0)),
      rate: Number(cy.rate) || 0,
      reverse: Number(cy.reverse) === 1 || Number(cy.reverse) === 2 ? 1 : 0,
    })),
  };
}

function cycleDurationMs(data) {
  const active = data.cycles.filter((cycle) => cycle && cycle.rate && cycle.high > cycle.low);
  if (!active.length) return 0;
  let m = 1;
  for (const cycle of active) {
    const size = cycle.high - cycle.low + 1;
    m = lcm(m, size / gcd(size, Math.abs(cycle.rate)));
  }
  return 280000 * m;
}

function buildIndexRemap(cycles, timeNow) {
  const map = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (const cycle of cycles) {
    if (!cycle || !cycle.rate) continue;
    const low = Math.max(0, cycle.low | 0);
    const high = Math.min(255, cycle.high | 0);
    if (high <= low) continue;
    const size = high - low + 1;
    const amountRaw = Math.floor((timeNow / (1000 / (cycle.rate / 280))) % size);
    const amount = cycle.reverse === 1 ? (size - amountRaw) % size : amountRaw;
    if (!amount) continue;
    const segment = map.slice(low, high + 1);
    for (let i = 0; i < size; i++) {
      map[low + ((i + amount) % size)] = segment[i];
    }
  }
  return map;
}

class ByteWriter {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 0xff); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  ascii(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  block(data) {
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      this.u8(chunk.length);
      for (const b of chunk) this.u8(b);
    }
    this.u8(0);
  }
  toBuffer() { return Buffer.from(this.bytes); }
}

function lzwEncodeIndices(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const out = [];
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;

  let bitBuffer = 0;
  let bitCount = 0;
  const pushCode = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  pushCode(clearCode);
  let prev = indices[0];
  pushCode(prev);

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    if (nextCode < 4096) {
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      pushCode(clearCode);
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    }
    pushCode(k);
    prev = k;
  }

  pushCode(endCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return Uint8Array.from(out);
}

function encodeGif({ width, height, colors, frames, delayCs }) {
  const w = new ByteWriter();
  w.ascii('GIF89a');
  w.u16(width);
  w.u16(height);

  const gctSizePow = 7;
  const packed = 0x80 | 0x70 | gctSizePow;
  w.u8(packed);
  w.u8(0);
  w.u8(0);

  for (let i = 0; i < 256; i++) {
    const c = colors[i] || [0, 0, 0];
    w.u8(c[0] & 0xff); w.u8(c[1] & 0xff); w.u8(c[2] & 0xff);
  }

  w.u8(0x21); w.u8(0xff); w.u8(0x0b); w.ascii('NETSCAPE2.0');
  w.u8(0x03); w.u8(0x01); w.u16(0); w.u8(0);

  for (const indices of frames) {
    w.u8(0x21); w.u8(0xf9); w.u8(0x04);
    w.u8(0x00);
    w.u16(delayCs);
    w.u8(0x00);
    w.u8(0x00);

    w.u8(0x2c);
    w.u16(0); w.u16(0); w.u16(width); w.u16(height);
    w.u8(0x00);

    w.u8(8);
    const lzw = lzwEncodeIndices(indices, 8);
    w.block(lzw);
  }

  w.u8(0x3b);
  return w.toBuffer();
}

function run() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (options.help || positional.length < 2) {
    usage();
    process.exit(options.help ? 0 : 1);
  }

  const [inputPath, outputPath] = positional;
  const fps = Number(options.fps);
  const maxFrames = Number(options.maxFrames);
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid --fps: ${options.fps}`);
  if (!Number.isFinite(maxFrames) || maxFrames <= 0) throw new Error(`Invalid --max-frames: ${options.maxFrames}`);

  const data = normalizeData(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  if (!data.width || !data.height) throw new Error('Missing width/height in JSON');
  if (data.pixels.length !== data.width * data.height) throw new Error('Pixel array size mismatch');

  const totalMs = cycleDurationMs(data);
  const delayCs = Math.max(1, Math.round(100 / fps));
  const delayMs = delayCs * 10;
  const idealFrames = totalMs > 0 ? Math.ceil(totalMs / delayMs) : 1;
  const frameCount = Math.min(maxFrames, Math.max(1, idealFrames));
  if (idealFrames > maxFrames) {
    console.warn(`Warning: full cycle is ${idealFrames} frames; capped to ${maxFrames}.`);
  }

  const frames = [];
  const frameBuffer = new Uint8Array(data.pixels.length);
  for (let i = 0; i < frameCount; i++) {
    const t = i * delayMs;
    const remap = buildIndexRemap(data.cycles, t);
    for (let p = 0; p < data.pixels.length; p++) {
      frameBuffer[p] = remap[data.pixels[p]];
    }
    frames.push(Uint8Array.from(frameBuffer));
  }

  const gif = encodeGif({
    width: data.width,
    height: data.height,
    colors: data.colors,
    frames,
    delayCs,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, gif);
  console.log(`Wrote ${outputPath}`);
  console.log(`Frames: ${frameCount}`);
  console.log(`Frame delay: ${delayCs}cs`);
  if (totalMs > 0) console.log(`Cycle period: ${(totalMs / 1000).toFixed(2)}s`);
}

run();
