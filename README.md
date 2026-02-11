## Old School Color Cycling with HTML5

Anyone remember [Color cycling](https://en.wikipedia.org/wiki/Color_cycling) from the 90s?  This was a technology often used in 8-bit video games of the era, to achieve interesting visual effects by cycling (shifting) the color palette.  Back then video cards could only render 256 colors at a time, so a palette of selected colors was used.  But the programmer could change this palette at will, and all the onscreen colors would instantly change to match.  It was fast, and took virtually no memory.  Thus began the era of color cycling.

Most games used the technique to animate water, fire or other environmental effects.  Unfortunately, more often than not this looked terrible, because the artist simply drew the scene once, picked some colors to be animated and set them to cycle.  While this technically qualified as "color cycling", it looked more like a bad acid trip.  For an example, just look at the water in [this game](https://www.youtube.com/watch?v=wfkEr3Bxoqg).

However, there was one graphic artist who took the technique to a whole new level, and produced absolutely breathtaking color cycling scenes.  [Mark J. Ferrari](https://www.markferrari.com/), who also illustrated all the original backgrounds for [LucasArts](https://en.wikipedia.org/wiki/Lucasfilm_Games) [Loom](https://en.wikipedia.org/wiki/Loom_%28video_game%29), and some for [The Secret of Monkey Island](https://en.wikipedia.org/wiki/The_Secret_of_Monkey_Island), invented his own unique ways of using color cycling for environmental effects that you really have to see to believe.  These include rain, snow, ocean waves, moving fog, clouds, smoke, waterfalls, streams, lakes, and more.  And all these effects are achieved without any layers or alpha channels -- just one single flat image with one 256 color palette.

Unfortunately the art of color cycling died out in the late 90s, giving way to newer technologies like 3D rendering and full 32-bit "true color" games.  However, 2D pixel graphics of old are making a comeback in recent years, with mobile devices and web games.  I thought now would be the time to reintroduce color cycling, using open web technologies like the [HTML5](https://en.wikipedia.org/wiki/HTML5) [Canvas element](https://en.wikipedia.org/wiki/Canvas_element).

This demo is an implementation of a full 8-bit color cycling engine, rendered into an HTML5 Canvas in real-time.  I am using 35 of Mark's original 640x480 pixel masterpieces which you can explore, and I added some ambient environmental soundtracks to match.  Please enjoy, and the source code is free for you to use in your own projects (download links at the bottom of the article).

![Screenshot](https://pixlcore.com/software/canvascycle/screenshot.png)

- **[Launch Demo With Sound](http://www.effectgames.com/demos/canvascycle/)**
- **[Launch Demo Without Sound](http://www.effectgames.com/demos/canvascycle/?sound=0)**

## Q & A with Mark J. Ferrari

Hey everyone!  Mark has generously donated some of his time to answer the most popular questions on his color cycling artwork.  Please read about it here: [Q & A with Mark J. Ferrari](http://www.effectgames.com/effect/article.psp.html/joe/Q_A_with_Mark_J_Ferrari).

## BlendShift Cycling

Those of you familiar with color cycling may notice something a little "different" about the palette animation in this engine.  Many years ago I had an idea to improve color cycling by "fading" colors into each other as they shifted, to produce many "in between" frames, while preserving the overall "speed" of the cycling effect.  This creates a much smoother appearance, and gives the illusion of more colors in the scene.  I call this technique **BlendShift Cycling**.  Someone may have invented this before me, but I've certainly never seen it used.

You can really see the effect this has if you slow down the cycling speed (Click "Show Options" and click on either &frac14; or &frac12;), then turn BlendShift off and on by clicking on the "Standard" and "Blend" cycling modes.  See the difference?  The colors "shift" positions in whole steps when using Standard mode, but fade smoothly into each other when using BlendShift.  If only I'd invented this trick 20 years ago when it really mattered!

## Optimization

In order to achieve fast frame rates in the browser, I had to get a little crazy in the engine implementation.  Rendering a 640x480 indexed image on a 32-bit RGB canvas means walking through and drawing 307,200 pixels per frame, in JavaScript.  That's a very big array to traverse, and some browsers just couldn't keep up.  To overcome this, I pre-process the images when they are first loaded, and grab the pixels that reference colors which are animated (i.e. are part of cycling sets in the palette).  Those pixel X/Y offsets are stored in a separate, smaller array, and thus only the pixels that change are refreshed onscreen.

The framerate is capped at 60 FPS.

## Amiga IFF / LBM Files

Mark's scenes are actually [Amiga IFF / ILBM](https://en.wikipedia.org/wiki/ILBM) files, originally created with [Deluxe Paint](https://en.wikipedia.org/wiki/Deluxe_Paint) in DOS.  Ah, those were the days!  So, to make this work, I had to write a converter program which parses the files and extracts the pixels, the palette colors, and all the cycling information, and writes it out as something JavaScript can understand.  The data is stored as [JSON](https://en.wikipedia.org/wiki/JSON) on disk, and delivered to the browser with gzip compression.  The data sent over the wire ends up being about 100K per scene, which isn't too bad (most of the soundtracks are larger than that, haha).  My converter script is written in C++, but included in the source package if you are interested.

**Update:** I also wrote a Node.js implementation of my LBM converter utility: [lbmtool](https://github.com/jhuckaby/lbmtool)

## Can I Use My Own Images?

Yes -- but there are a few important constraints.

CanvasCycle expects **indexed 8-bit image data** (0 - 255 palette indices per pixel), plus a 256-color palette and optional cycle ranges.  This means a regular PNG/JPEG cannot just be dropped in directly unless you first convert it into indexed color data.

A practical workflow is:

1. Quantize your source image down to 256 colors (or fewer) in an image editor.
2. Convert/export to Amiga IFF / ILBM (or PC LBM) and run it through `lbm2json` (C++ tool in this repo) or [`lbmtool`](https://github.com/jhuckaby/lbmtool).
3. Add cycle ranges to specific palette slots you want animated (water, lights, fire, etc.).

You can also generate compatible JSON yourself if it matches the same structure used in `canvascycle/images/*.LBM.json`:

- `width`, `height`
- `colors` (array of up to 256 RGB triplets)
- `cycles` (palette cycle descriptors with `low`, `high`, `rate`, `reverse`)
- `pixels` (flat array of palette indices, length = `width * height`)

Reusing one of the existing cycling palettes on an unrelated image is possible, but the effect often looks random unless your image was deliberately painted with those palette index ranges in mind.  In practice, the best results come from designing your image around the cycle bands you plan to animate.


## How Do I Generate New Cycling Palettes?

Great question -- this is where the "art" happens.

A reliable recipe is to reserve dedicated palette bands for each animation effect, then paint using those indices intentionally.

1. Plan your cycle bands first.
   - Example: `32-47` water shimmer, `48-55` foam highlights, `56-63` window lights.
   - Keep each band contiguous so it can be cycled with one `{low, high}` range.
2. Build color ramps per band.
   - For water, create a loopable hue/value ramp (dark -> mid -> bright -> dark).
   - For fire/lights, create a pulse-friendly ramp (dim -> bright -> dim).
3. Paint with palette indices (not just RGB appearance).
   - The exact index number matters more than the visible color while authoring.
   - Any pixel painted with a band index will animate when that band cycles.
4. Assign cycle metadata.
   - Set `low`/`high` to the band limits.
   - Set `rate` to speed (higher = faster).
   - Toggle `reverse` for opposite direction movement.
5. Iterate quickly.
   - Start with short ramps (8-16 colors), verify motion, then expand/refine.
   - If motion feels noisy, smooth the ramp transitions rather than changing cycle speed first.

### Practical Tips

- Keep static colors separated from animated bands so accidental cycling does not occur.
- Use multiple small bands instead of one huge band for more control.
- Opposing directions (`reverse` on one band, off on another) create richer motion.
- Different rates across nearby bands can fake turbulence, sparkle, or depth.

### Minimal Cycle Example

If your palette reserves indices `32-47` for water and `96-103` for blinking lights:

```js
cycles:[
  { reverse:0, rate:180, low:32, high:47 },
  { reverse:1, rate:90,  low:96, high:103 }
]
```

Then paint water pixels using indices `32-47` and lights using `96-103`.
Only those pixels will animate, and everything else remains static.


### Technical: How to Generate Palette Data and Pixel Indices

At a low level, CanvasCycle scene files need two linked datasets:

- `colors`: palette table (up to 256 RGB entries)
- `pixels`: one palette index per pixel (`width * height` total)

For each `pixels[n]`, the value is an integer that points into `colors[pixels[n]]`.

A practical technical pipeline is:

1. Quantize your source image to indexed color (max 256 colors).
2. Export both:
   - a palette table (RGB triplets)
   - an index map (one byte/int index per pixel)
3. Build cycle ranges over index bands you intentionally reserved for animation.
4. Emit the final scene object with `width`, `height`, `colors`, `cycles`, `pixels`.

#### Option A: Use ImageMagick to Quantize and Inspect

```bash
# 1) Quantize to 256 colors
magick input.png -colors 256 PNG8:quantized.png

# 2) Inspect palette (text dump includes the colormap)
magick quantized.png txt:- > quantized.txt
```

`quantized.txt` gives you the palette and per-pixel index/color information you can parse into `colors` and `pixels`.

#### Option B: Generate Data Programmatically with Node.js

```js
// npm i sharp
const sharp = require('sharp');

(async () => {
  // Quantize to an indexed-like PNG with <= 256 colors
  // (sharp can reduce the palette; then we read the raw RGB pixels)
  const { data, info } = await sharp('input.png')
    .png({ palette: true, colors: 256 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info; // usually RGB(A)

  // Build palette + pixel index map (simple exact-color table)
  const colorToIndex = new Map();
  const colors = [];
  const pixels = new Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += channels, p++) {
    const r = data[i + 0];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r},${g},${b}`;

    let idx = colorToIndex.get(key);
    if (idx === undefined) {
      idx = colors.length;
      if (idx >= 256) throw new Error('Palette exceeded 256 colors');
      colorToIndex.set(key, idx);
      colors.push([r, g, b]);
    }
    pixels[p] = idx;
  }

  // Pad to 256 entries (typical for CanvasCycle assets)
  while (colors.length < 256) colors.push([0, 0, 0]);

  const scene = {
    filename: 'MYSCENE.LBM',
    width,
    height,
    colors,
    cycles: [
      { reverse: 0, rate: 180, low: 32, high: 47 }
    ],
    pixels
  };

  console.log(JSON.stringify(scene));
})();
```

Note: this repo's `*.LBM.json` files are consumed as JavaScript object literals (JSONP callback wrapper), so keys are often unquoted in-file. If you generate strict JSON first, convert it to the same object-literal style expected by the loader.

#### Validation Checklist

- `colors.length <= 256` (or padded to exactly 256)
- Every pixel index is in range `0..colors.length-1`
- `pixels.length === width * height`
- Every cycle range satisfies `0 <= low <= high < colors.length`
- Reserve cycle bands for animation; keep static art outside those bands

## Browser Support

The color cycling engine works in all modern browsers.

## Download Source

Here is the JavaScript and C++ source code to my color cycling engine.  I am releasing it under the [MIT License](https://github.com/jhuckaby/canvascycle/blob/main/LICENSE.md).  The package comes with one test LBM image, converted to JSON.  The actual artwork shown in the demo is copyright, and cannot be used.

https://github.com/jhuckaby/canvascycle/archive/refs/heads/main.zip
