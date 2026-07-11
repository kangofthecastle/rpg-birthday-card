# Dropping in real art

Like the audio folder, the game runs fine with **no image files added here** —
every backdrop, prop, and floor has a procedural (code-drawn) fallback. But you
can replace specific pieces of art just by dropping a PNG into the right spot
with the exact filename below. The game probes for these files when the page
loads (`src/scenes/BootScene.ts`); if a file is missing it silently falls back
to the procedural version. **No code changes needed.**

## Optional drop-in slots

| Drop a PNG at | Replaces |
| --- | --- |
| `/assets/doormat.png` | The interior exit doormat (see the important note below) |
| `/assets/tiles/ground-tileset.png` | The outdoor ground tiles (64×64 tiles) |
| `/assets/exteriors/recipient-home.png` | ____'s house exterior on the path |
| `/assets/exteriors/friendtwo-house.png` | ____'s house exterior on the path |
| `/assets/exteriors/friendone-house.png` | ____'s house exterior on the path |
| `/assets/tiles/shore-water.png` | The clearing's dark-water shore band — **512×128, horizontally tileable**. Tiled across the shore with the awakened-glow effects on top. Procedural water is the fallback. |
| `/assets/ending/water-arrival.png` | Ending transition frame 1 — open water under a first hint of galaxy (**1280×720**). Cross-fades in over the drifting boat. Skipped if absent. |
| `/assets/ending/water-to-galaxy.png` | Ending transition frame 2 — the water turning to galaxy (**1280×720**). Skipped if absent. |
| `/assets/ending/galaxy-ground.png` | **OPTIONAL** full-bleed painted ground for the final galaxy scene (**1408×1024**, the final-spot map size). Replaces the ground that is otherwise **composed from the existing `ending-water.png`** (tiled + code shimmer + light-pools) — so nothing new needs generating. Drop one in only if you want a hand-painted galaxy floor. |

## ⚠️ The doormat must be drawn FLAT / straight-on

`/assets/doormat.png` is special: the engine does **not** paste it onto the
screen as-is. It **warps the image into the floor plane** — projecting it onto
the exit rectangle's foreshortened parallelogram so the mat lies flat on the
ground and lines up with the doorway (see `warpTextureToFloorQuad` in
`src/game/roomRenderer.ts`).

Because the engine applies the perspective itself, the source image must be a
**flat, top-down / straight-on** picture of a doormat — a plain rectangle, as if
photographed from directly above, with **no built-in perspective, no
foreshortening, no drawn floor or shadow around it**. If the PNG already has
perspective baked in, the warp applies it a *second* time and the mat looks
skewed and wrong.

There is currently **no** `doormat.png` here on purpose — the procedural woven
mat (drawn in `buildDoormatTexture`) is preferred, and a previous perspective-
baked drop-in was removed for exactly the double-warp reason above. The file
hook is intentionally kept in place so a proper **flat** doormat texture can be
dropped in later with zero code changes.
