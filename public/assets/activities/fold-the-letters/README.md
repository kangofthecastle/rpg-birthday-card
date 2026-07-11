# Drop-in art for the keepsake ritual ("fold")

The ritual draws its three boat pieces procedurally by default. Drop any of the
PNGs below in here and they are picked up automatically (file-first probe via
`isImageUrl`) with **zero code changes** — both in the fold stage's boat tray and
in the sail-away cinematic. Each piece is a SEPARATE transparent PNG that
composites with the others; there is no single monolithic boat sprite.

## Pieces

| Filename | What it is | Recommended source size | Composited size (px) | Anchor point |
| --- | --- | --- | --- | --- |
| `hull.png` | The boat hull (____'s letter), folded flat. Sits on the waterline. | 264×88 (2×) | 132×44 | tray `(0, −16)`, centred |
| `sail.png` | The sail (____'s letter) on its mast. Mounts on the hull's mast point. | 152×156 (2×) | 76×78 | tray `(2, −58)`, centred |
| `lantern.png` | The paper lantern (____'s sheet music), glowing. Hangs at the bow. | 60×80 (2×) | 30×40 | tray `(−52, −26)`, centred |
| `recipient-boat.png` | OPTIONAL. ____ sitting in the finished boat, used only in the sail-away cinematic as an overlay rider. | 240×180 | fits `.fold-sail__boat` (120×90) | rider slot |
| `backdrop.png` | OPTIONAL. Full-canvas painted stage backdrop (twilight table + water). Drawn under everything, replacing the flat gradient; opaque. Its **waterline must sit at pixel y=704** (= logical y=352 = the tray waterline) so the boat floats on the paint. When present the tray's translucent navy water band is skipped. | 1280×800 (2×) | fills the 640×400 canvas | full canvas, `(0,0)` |

## Hoist-stage art (the sail being raised)

Optional drop-in art used **only during the HOIST stage** — the moment the sail
rides up the mast. Both are probed file-first (zero code changes) and everything
looks unchanged until they land; the assembled boat, the tray, and the ending all
keep using `sail.png`.

| Filename | What it is | Recommended source size | Drawn as | Fallback |
| --- | --- | --- | --- | --- |
| `sail-loose.png` | The sail fabric **alone** (no pole), transparent. Drawn as the hoisted cloth with the same gentle billow/wind warp as `sail.png`. | ~256×256 region, alpha | Scaled to ~104px wide, warped row-by-row up the mast | `sail-loose.png` → `sail.png` → procedural quad |
| `mast.png` | A proper painted mast / pole, authored **tall and thin**, transparent. Replaces the procedural `#bd914f` bar. | 64×512 (tall/thin), alpha | Scaled to the mast height (`mastTop`..`mastBottom`, ~184px), centred on the mast line, aspect-preserved | procedural warm-wood bar |

- Author `sail-loose.png` with the fabric's **luff (pole edge) at the left**, the
  same as `sail.png`, so it lines up against the mast; the middle rows belly out.
- Author `mast.png` upright with the pole centred horizontally in the image; it is
  drawn centred on the mast line and scaled to the mast height, so its width comes
  from the art's own aspect ratio (64×512 ⇒ ~23px wide at ~184px tall).

## Paper textures (the sheet each piece is folded from)

Optional drop-in textures for the **flat paper** worked during each verb — the
printed face that folds, hoists and rolls with the geometry. Drop any of these in
and it replaces the procedural paper + handwriting for that piece in **every fold
state** (file-first probe, zero code changes); procedural paper is the fallback
when a file is absent. Each must be **flat and straight-on (no perspective/tilt)**
with the **paper filling the whole image edge-to-edge** (no margins) — the stage
maps it onto the sheet frame and clips/reflects it through the same fold math, so
it visibly halves and mirrors as the paper folds.

| Filename | Piece / verb | Dimensions | Requirement |
| --- | --- | --- | --- |
| `paper-friendone.png` | hull — ____'s letter (FOLD) | 512×640 | Flat, straight-on, fills the frame edge-to-edge |
| `paper-friendtwo.png` | sail — ____'s letter (HOIST) | 512×640 | Flat, straight-on, fills the frame edge-to-edge |
| `paper-sheetmusic.png` | lantern — ____'s sheet music (ROLL) | 512×640 | Flat, straight-on, fills the frame edge-to-edge |

## Coordinate system

- The fold stage canvas is a fixed **640×400** logical space.
- The boat **tray** frame has its origin at the waterline centre: logical
  `(320, 370)`. Anchor points above are in this tray-local frame; `−y` is up.
- Each piece is drawn **centred on its anchor** at the composited size. Keep the
  art's own visual centre at the middle of the PNG so it lines up.
- Draw order (back to front): `hull` → `sail` → `lantern`. The sail's foot is
  authored to meet the hull deck; the lantern hangs off the bow (left) side.

## Sail-away cinematic

The cinematic composites the SAME `hull.png` / `sail.png` / `lantern.png` as
`<img>` layers (falling back to the CSS shapes when a file is absent), plus the
optional `recipient-boat.png` rider overlay. Keep the three pieces readable at small
size — the boat scales down as it drifts out to sea.

## Audio

Lives under `public/audio/` (see that folder's README). Relevant keys:
`sfx-paper-fold` (hull creases), `sfx-sail-hoist` (cloth + rope, the sail
catching), `sfx-lantern-kindle` (the glow blooming), `sfx-boat-expand` (the boat
opening out), and `sfx-water-lap` (the drift). The lantern's rolling plucks reuse
the live violin-note synth (the notes of the piece ____ just played).
