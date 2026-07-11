# Drop-in art for "the piece on the stand"

The violin activity draws a simple procedural room + sheet music by default.
Drop a real backdrop here to replace the procedural room — no code changes:

| Filename | What it is |
| --- | --- |
| `room-backdrop.png` | A warm dusk room / music-stand backdrop, 640×360 (16:9). Drawn at 60% alpha over the procedural room but under the light pass + sheet, so the dim/warmth/flood choreography still reads — keep it soft and unbusy. Composition to match the procedural scene: a **window at the left margin** (the dusk sky + last gold of evening, and the source of the finale's golden flood), a warm lamp pool up-right, and a wooden music stand centred low. If absent, that room is drawn procedurally. |
| `treble-clef.png` | The treble-clef glyph in the sheet's left margin, replacing the hand-drawn vector fallback. **200 × 560 px (≈1:2.8), transparent background** (only the clef's ink is opaque — no paper, box, or staff lines baked in). Scaled UNIFORMLY to ~120px tall in the paper's local space (width follows its own aspect), so author the glyph to fill the full canvas height edge-to-edge with a few px of breathing room; the source aspect is preserved, so keep it a natural, tall treble-clef proportion. Style: a single warm **sepia / dark-brown ink** stroke (`#5a3f24`), hand-inked / lightly calligraphic (not a crisp printed font glyph), matching the cream-paper + amber-note look; faint natural stroke-width variation and a hint of ink texture are welcome, but keep edges clean against transparency. A real, correctly-proportioned treble (G) clef: the top curl above the staff, the round bowl low, the tail hooking below. If absent, the vector clef is drawn. |

Audio for this activity lives under `public/audio/` (see that folder's README):
the per-note violin tones are synthesized live, while `sfx-violin-waver` (the
gentle miss) and `sfx-violin-swell` (the full arrangement pouring in at the
finale) are file-first drop-ins there.
