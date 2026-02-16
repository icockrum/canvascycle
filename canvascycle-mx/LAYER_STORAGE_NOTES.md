# Cycle8 Layering Notes (File Size + Editability)

This note captures a practical plan for adding editor layers without multiplying JSON size per layer.

## Current baseline

Cycle8 currently stores one flat indexed image payload:

- `width`, `height`
- `pixels` (one palette index per pixel)
- `colors` (256 RGB entries)
- `cycles` (palette cycle ranges)

That is the shape expected by both the editor and the standalone player/export runtime.

## Why naive layers get expensive

For a 640x480 image:

- Pixel count is `307,200`
- If you duplicate full `pixels` data per layer, each layer adds another large integer array in JSON text.

In practice, most size is the textual `pixels` array, not palette/cycle metadata.

## Recommended model: sparse layer deltas in editor format

Keep one **base display layer**, then store each additional layer as sparse edits only:

```json
{
  "format": "cycle8.layered.v1",
  "width": 640,
  "height": 480,
  "base": {
    "pixels": [/* full base image */],
    "colors": [[0,0,0], [..]],
    "cycles": [{"low":1,"high":5,"rate":280,"reverse":0,"active":true}]
  },
  "layers": [
    {
      "id": "layer-1",
      "name": "Ripples",
      "visible": true,
      "lock": false,
      "paletteMode": "shared",
      "patches": [
        { "offset": 9281, "run": [17,17,17,18,18] },
        { "offset": 9321, "run": [17,17,19] }
      ]
    }
  ]
}
```

Notes:

- `offset` is linear pixel index (`y * width + x`).
- `run` stores contiguous changed palette indices.
- This keeps files small when layers are mostly transparent/no-op.
- `paletteMode: "shared"` avoids per-layer palette duplication.

## Export strategy (player vs editable)

Use **two export targets**:

1. **Player export (`.json` / embed JS): flattened**
   - Keep existing schema (`width`, `height`, `pixels`, `colors`, `cycles`).
   - Bake visible layers into one final `pixels` array for maximum compatibility.

2. **Project export (`.cycle8.json`): editable layered source**
   - Save `base + layers` structure (including sparse patches).
   - This remains round-trippable in the editor.

This avoids complicating the runtime while preserving non-destructive editing.

## Optional optimization knobs

If project files are still large:

- Store `patches` as `(offset, length, value...)` typed runs.
- Group per-row patches to improve JSON gzip compression.
- Offer optional compressed project export (`.cycle8.json.gz`) for archival/sharing.

## Migration / compatibility approach

- If uploaded JSON has `pixels`, load as legacy single-layer project.
- Internally treat it as:
  - base = legacy image
  - layers = []
- Existing player/export code can remain unchanged by flattening at export time.

## Practical decision rule

Add layering only if your median edit session changes a minority of pixels in each extra layer.

- If an added layer often repaints most of the canvas, sparse deltas lose their advantage.
- If edits are local (effects, touchups, masks), sparse deltas can keep growth far below +1 full image per layer.
