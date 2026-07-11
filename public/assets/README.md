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
