import fs from "fs";
import path from "path";
import UPNG from "upng-js";

// ---- CLI ARGUMENTS ----
const [, , inputPath, outputPathArg] = process.argv;

if (!inputPath) {
	console.error("Usage: node png-to-json.js <input.png> [output.json]");
	process.exit(1);
}

if (!fs.existsSync(inputPath)) {
	console.error(`File not found: ${inputPath}`);
	process.exit(1);
}

const outputPath =
	outputPathArg || path.basename(inputPath, path.extname(inputPath)) + ".json";

// ---- READ FILE ----
// const buffer = fs.readFileSync("desert.png");
const buffer = fs.readFileSync(inputPath);

// Decode PNG
const png = UPNG.decode(buffer);

// Safety checks
console.log("png.ctype:", png.ctype);
if (png.ctype !== 3) {
	throw new Error(`PNG is not indexed color (ctype ${png.ctype})`);
}

const width = png.width;
const height = png.height;

// ---- COLORS (original palette) ----
if (!png.tabs || !png.tabs.PLTE) {
	throw new Error("PNG has no PLTE chunk");
}

const rawColors = png.tabs.PLTE;
const colors = [];

for (let i = 0; i < rawColors.length; i += 3) {
	colors.push([rawColors[i], rawColors[i + 1], rawColors[i + 2]]);
}

// ---- PIXEL INDICES ----
const raw = png.data;
const pixels = new Uint8Array(width * height);

const rowStride = Math.ceil(width / 4) * 4;
let dst = 0;

for (let y = 0; y < height; y++) {
	const rowStart = y * rowStride;
	for (let x = 0; x < width; x++) {
		pixels[dst++] = raw[rowStart + x];
	}
}

// ---- COLOR METRICS ----
function rgbToHue(r, g, b) {
	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;

	if (d === 0) return 0;

	let h;
	switch (max) {
		case r:
			h = ((g - b) / d) % 6;
			break;
		case g:
			h = (b - r) / d + 2;
			break;
		default:
			h = (r - g) / d + 4;
	}
	return (h * 60 + 360) % 360;
}

function rgbToLuminance(r, g, b) {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToSaturation(r, g, b) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	return max === 0 ? 0 : (max - min) / max;
}

// ---- HUE + LUMINANCE SORT ----
// Build palette entries with original indices
// const palette = colors.map((rgb, index) => ({
// 	index,
// 	rgb,
// 	hue: rgbToHue(rgb[0], rgb[1], rgb[2]),
// }));
const palette = colors.map((rgb, index) => {
	const [r, g, b] = rgb;
	return {
		index,
		rgb,
		hue: rgbToHue(r, g, b),
		luma: rgbToLuminance(r, g, b),
	};
});
// add saturation
// palette.sort((a, b) => {
// 	if (a.sat !== b.sat) return b.sat - a.sat; // saturated first
// 	if (a.hue !== b.hue) return a.hue - b.hue;
// 	return a.luma - b.luma;
// });

// Sort palette by hue
// palette.sort((a, b) => a.hue - b.hue);
palette.sort((a, b) => {
	if (a.hue !== b.hue) return a.hue - b.hue;
	return a.luma - b.luma;
});

// ---- REMAP INDICES ----
// Build remap table
const remap = new Uint8Array(palette.length);
palette.forEach((entry, newIndex) => {
	remap[entry.index] = newIndex;
});

// Remap pixel indices
for (let i = 0; i < pixels.length; i++) {
	pixels[i] = remap[pixels[i]];
}

// Build reordered palette
const sortedColors = palette.map((p) => p.rgb);

// ---- Sanity checks ----
console.log("Image size:", width, height);
console.log("Colors size:", sortedColors.length);
console.log("Pixel count:", pixels.length);
console.log("Expected pixels:", width * height);
console.log("First 16 indices:", pixels.slice(0, 16));

if (pixels.length !== width * height) {
	throw new Error("Pixel buffer length mismatch");
}

// ---- CanvasCycle-compatible output ----
const canvasCycleData = {
	width,
	height,
	pixels: Array.from(pixels),
	colors: sortedColors,
	cycles: [
		{ low: 32, high: 47, rate: 3500, reverse: 2 },
		{ low: 48, high: 55, rate: 3500, reverse: 2 },
	],
};

// fs.writeFileSync("desert.json", JSON.stringify(canvasCycleData, null, 2));
fs.writeFileSync(outputPath, JSON.stringify(canvasCycleData, null, 2));
console.log(`Wrote ${outputPath}`);
