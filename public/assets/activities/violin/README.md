# Drop-in art for "the piece on the stand"

The violin activity draws a simple procedural room + sheet music by default.
Drop a real backdrop here to replace the procedural room — no code changes:

| Filename | What it is |
| --- | --- |
| `room-backdrop.png` | A warm dusk room / music-stand backdrop, 640×360 (16:9). Drawn at 60% alpha over the procedural room but under the light pass + sheet, so the dim/warmth/flood choreography still reads — keep it soft and unbusy. Composition to match the procedural scene: a **window at the left margin** (the dusk sky + last gold of evening, and the source of the finale's golden flood), a warm lamp pool up-right, and a wooden music stand centred low. If absent, that room is drawn procedurally. |

Audio for this activity lives under `public/audio/` (see that folder's README):
the per-note violin tones are synthesized live, while `sfx-violin-waver` (the
gentle miss) and `sfx-violin-swell` (the full arrangement pouring in at the
finale) are file-first drop-ins there.
