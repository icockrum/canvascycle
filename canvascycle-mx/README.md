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
