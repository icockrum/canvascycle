import './style.css';
import UPNG from './vendor/upng.js';
import { CanvasCyclePlayer, normalizeData } from './player-core.js';

const sampleNames = ['desert', 'skullsorted', 'unpixellatedskull'];

const els = {
  viewer: document.querySelector('#viewer'),
  sampleSelect: document.querySelector('#sampleSelect'),
  prevBtn: document.querySelector('#prevBtn'),
  nextBtn: document.querySelector('#nextBtn'),
  resumeUploadedBtn: document.querySelector('#resumeUploadedBtn'),
  pauseBtn: document.querySelector('#pauseBtn'),
  downloadBtn: document.querySelector('#downloadBtn'),
  pngUpload: document.querySelector('#pngUpload'),
  jsonUpload: document.querySelector('#jsonUpload'),
  palette: document.querySelector('#palette'),
  cycles: document.querySelector('#cycles'),
  status: document.querySelector('#status')
};

const player = new CanvasCyclePlayer(els.viewer);
let currentSampleIndex = 0;
let activeData = null;
let uploadedSnapshot = null;

function init() {
  sampleNames.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    els.sampleSelect.appendChild(opt);
  });

  els.sampleSelect.addEventListener('change', async () => {
    currentSampleIndex = els.sampleSelect.selectedIndex;
    await loadSample(sampleNames[currentSampleIndex]);
  });
  els.prevBtn.addEventListener('click', async () => {
    currentSampleIndex = (currentSampleIndex - 1 + sampleNames.length) % sampleNames.length;
    els.sampleSelect.selectedIndex = currentSampleIndex;
    await loadSample(sampleNames[currentSampleIndex]);
  });
  els.nextBtn.addEventListener('click', async () => {
    currentSampleIndex = (currentSampleIndex + 1) % sampleNames.length;
    els.sampleSelect.selectedIndex = currentSampleIndex;
    await loadSample(sampleNames[currentSampleIndex]);
  });

  els.resumeUploadedBtn.addEventListener('click', () => {
    if (!uploadedSnapshot) return;
    setActiveData(cloneImageData(uploadedSnapshot));
    setStatus('Resumed uploaded image from memory.');
  });

  els.pauseBtn.addEventListener('click', () => {
    if (player.paused) {
      player.resume();
      els.pauseBtn.textContent = 'Pause';
    } else {
      player.pause();
      els.pauseBtn.textContent = 'Resume';
    }
  });

  els.downloadBtn.addEventListener('click', downloadCurrentJson);
  els.jsonUpload.addEventListener('change', onJsonUpload);
  els.pngUpload.addEventListener('change', onPngUpload);

  loadSample(sampleNames[currentSampleIndex]);
}

async function loadSample(name) {
  const url = `/images/${name}.json?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load sample: ${name}`);
  const json = await res.json();
  setActiveData(normalizeData({ ...json, filename: `${name}.json` }));
  setStatus(`Loaded sample: ${name}`);
}

function setActiveData(data) {
  activeData = data;
  player.loadFromData(activeData);
  renderPalette();
  renderCyclesEditor();
}

function renderPalette() {
  els.palette.innerHTML = '';
  activeData.colors.forEach((rgb, index) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.draggable = true;
    chip.dataset.index = String(index);
    chip.title = `${index}: rgb(${rgb.join(', ')})`;
    chip.style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', chip.dataset.index);
    });
    chip.addEventListener('dragover', (e) => e.preventDefault());
    chip.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIndex = Number(e.dataTransfer.getData('text/plain'));
      const toIndex = Number(chip.dataset.index);
      if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) return;
      reorderPalette(fromIndex, toIndex);
    });
    els.palette.appendChild(chip);
  });
}

function reorderPalette(fromIndex, toIndex) {
  const colors = activeData.colors;
  const moved = colors[fromIndex];
  colors.splice(fromIndex, 1);
  colors.splice(toIndex, 0, moved);

  const maxPaletteIndex = colors.length - 1;
  activeData.cycles.forEach((cycle) => adjustCycleRangeForMove(cycle, fromIndex, toIndex, maxPaletteIndex));

  const remap = new Uint8Array(colors.length);
  const oldIndices = [...Array(colors.length).keys()];
  const oldMoved = oldIndices[fromIndex];
  oldIndices.splice(fromIndex, 1);
  oldIndices.splice(toIndex, 0, oldMoved);
  for (let newIdx = 0; newIdx < oldIndices.length; newIdx++) {
    remap[oldIndices[newIdx]] = newIdx;
  }

  for (let i = 0; i < activeData.pixels.length; i++) {
    activeData.pixels[i] = remap[activeData.pixels[i]];
  }

  player.loadFromData(activeData);
  renderPalette();
  renderCyclesEditor();
}

function adjustCycleRangeForMove(cycle, fromIndex, toIndex, maxPaletteIndex) {
  if (!cycle) return;

  const low = clamp(Math.min(cycle.low, cycle.high), 0, maxPaletteIndex);
  const high = clamp(Math.max(cycle.low, cycle.high), 0, maxPaletteIndex);
  const inRange = (idx) => idx >= low && idx <= high;

  const remapped = [];
  for (let idx = low; idx <= high; idx++) {
    if (idx === fromIndex && !inRange(toIndex)) continue;
    remapped.push(remapIndexAfterMove(idx, fromIndex, toIndex));
  }

  if (!inRange(fromIndex) && inRange(toIndex)) {
    remapped.push(toIndex);
  }

  if (!remapped.length) {
    cycle.low = low;
    cycle.high = low;
    return;
  }

  cycle.low = clamp(Math.min(...remapped), 0, maxPaletteIndex);
  cycle.high = clamp(Math.max(...remapped), 0, maxPaletteIndex);
}

function remapIndexAfterMove(index, fromIndex, toIndex) {
  if (index === fromIndex) return toIndex;

  if (fromIndex < toIndex) {
    if (index > fromIndex && index <= toIndex) return index - 1;
    return index;
  }

  if (index >= toIndex && index < fromIndex) return index + 1;
  return index;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function renderCyclesEditor() {
  els.cycles.innerHTML = '';
  activeData.cycles.forEach((cycle, idx) => {
    const row = document.createElement('div');
    row.className = 'cycle-row';

    row.appendChild(makeLabel(`Cycle ${idx + 1}`));
    row.appendChild(makeSelect('reverse', cycle.reverse, [0, 1], (v) => cycle.reverse = Number(v)));
    row.appendChild(makeInput('rate', cycle.rate, -99999, 99999, (v) => cycle.rate = Number(v)));
    row.appendChild(makeInput('low', cycle.low, 0, 255, (v) => cycle.low = Number(v)));
    row.appendChild(makeInput('high', cycle.high, 0, 255, (v) => cycle.high = Number(v)));

    els.cycles.appendChild(row);
  });
}

function makeLabel(text) {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

function makeSelect(name, value, options, onChange) {
  const wrap = document.createElement('label');
  wrap.textContent = `${name}: `;
  const sel = document.createElement('select');
  options.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = String(v);
    if (v === value) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function makeInput(name, value, min, max, onChange) {
  const wrap = document.createElement('label');
  wrap.textContent = `${name}: `;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.addEventListener('change', () => {
    const parsed = Number(input.value);
    input.value = String(Math.max(min, Math.min(max, Number.isNaN(parsed) ? min : parsed)));
    onChange(input.value);
  });
  wrap.appendChild(input);
  return wrap;
}

async function onJsonUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  const json = JSON.parse(text);
  const normalized = normalizeData({ ...json, filename: file.name });
  setActiveData(normalized);
  uploadedSnapshot = cloneImageData(normalized);
  els.resumeUploadedBtn.disabled = false;
  setStatus(`Loaded JSON upload: ${file.name}`);
  event.target.value = '';
}

async function onPngUpload(event) {
  const [file] = event.target.files;
  if (!file) return;
  const buffer = await file.arrayBuffer();
  const png = UPNG.decode(buffer);

  if (png.ctype !== 3 || !png.tabs?.PLTE) {
    throw new Error('PNG must be indexed color with a PLTE palette.');
  }

  const rawColors = png.tabs.PLTE;
  const colors = [];
  for (let i = 0; i < rawColors.length; i += 3) {
    colors.push([rawColors[i], rawColors[i + 1], rawColors[i + 2]]);
  }

  const rowStride = Math.ceil(png.width / 4) * 4;
  const pixels = new Uint8Array(png.width * png.height);
  let dst = 0;
  for (let y = 0; y < png.height; y++) {
    const rowStart = y * rowStride;
    for (let x = 0; x < png.width; x++) {
      pixels[dst++] = png.data[rowStart + x];
    }
  }

  const converted = normalizeData({
    filename: file.name.replace(/\.png$/i, '.json'),
    width: png.width,
    height: png.height,
    pixels,
    colors,
    cycles: []
  });

  setActiveData(converted);
  uploadedSnapshot = cloneImageData(converted);
  els.resumeUploadedBtn.disabled = false;
  setStatus(`Converted PNG upload: ${file.name}`);
  event.target.value = '';
}

function downloadCurrentJson() {
  if (!activeData) return;
  const payload = {
    filename: activeData.filename,
    width: activeData.width,
    height: activeData.height,
    pixels: Array.from(activeData.pixels),
    colors: activeData.colors,
    cycles: activeData.cycles
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = payload.filename || 'canvascycle-export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function cloneImageData(data) {
  return normalizeData({
    filename: data.filename,
    width: data.width,
    height: data.height,
    pixels: Uint8Array.from(data.pixels),
    colors: data.colors.map((c) => [c[0], c[1], c[2]]),
    cycles: data.cycles.map((cy) => ({ ...cy }))
  });
}

function setStatus(text) {
  els.status.textContent = text;
}

init();
