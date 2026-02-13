# CanvasCycle MX

CanvasCycle MX now mirrors the original CanvasCycle presentation and controls, while adding editor-focused import/export features.

## What changed in this iteration

- Preserved the original full canvas layout and right-side options panel styling.
- Removed sound controls.
- Replaced PHP/JSONP image loading with `fetch()` + timestamp cache-busting.
- Added pause/resume playback.
- Added indexed PNG upload and in-browser conversion to CanvasCycle JSON.
- Added JSON upload for previously exported files.
- Added drag-and-drop palette chip reordering with pixel remapping.
- Added editable cycle list (`reverse`, `rate`, `low`, `high`).
- Added JSON download for current working image.
- Retains uploaded image in memory and allows resuming it after sample browsing.

## Run

Serve the repository with any static web server and open:

`/canvascycle-mx/index.html`

Standalone player demo page:

`/canvascycle-mx/public/player/standalone.html`

## Single-file self-running embeds

You can now generate a single JavaScript file that contains both the player runtime and your scene JSON payload. The output script is self-executing, keeps everything in an internal scope, and auto-creates its own `<canvas>` where the `<script>` tag appears.

Generate an embed script:

```bash
npm run wrap-player -- canvascycle-mx/public/images/TESTRAMP.json public/player/testramp-embed.js
```

Then include it anywhere in HTML (no manual init call required):

```html
<script src="/public/player/testramp-embed.js"></script>
```

Each embed file is isolated, so you can include multiple different animations on the same page by adding multiple `<script>` tags.

In the editor UI, both **Export JSON** and **Export Embed** now download minimized files (compact single-line output with no extra whitespace).
