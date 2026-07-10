# Drop-in art for "the piece on the stand"

The violin activity draws a simple procedural room + sheet music by default.
Drop a real backdrop here to replace the procedural room — no code changes:

| Filename | What it is |
| --- | --- |
| `room-backdrop.png` | A warm room / music-stand backdrop, 640×360 (16:9). Drawn at 50% alpha behind the sheet music, so keep it soft and unbusy. If absent, a procedural warm room with a window is used. |

Audio for this activity lives under `public/audio/` (see that folder's README):
the per-note violin tones are synthesized live, while `sfx-violin-waver` (the
gentle miss) and `sfx-violin-swell` (the full arrangement pouring in at the
finale) are file-first drop-ins there.
