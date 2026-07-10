# Dropping in real music and sound

This game already sounds okay without any files here — every music bed and
sound effect has a synthesized (computer-generated) fallback built in. But
if you want to use real recordings or a proper SFX pack, just drop the
files into this folder (`public/audio/`) with the exact filenames below.
**No code changes, no rebuild config, nothing to ask Claude/Codex for** —
the game checks this folder automatically and picks up new files the next
time the page loads.

## How it works

- For each sound the game wants to play, it first tries `<name>.mp3`, then
  `<name>.ogg`, in this folder.
- If neither file exists (or the file is missing/corrupt), the game just
  quietly uses its built-in synthesized version instead. Nothing breaks,
  nothing errors on screen — you'll only see one quiet debug-log line in
  the browser console either way, if you go looking.
- You can drop in as many or as few files as you want. Partial sets are
  totally fine — e.g. add real music for the ending only, leave everything
  else synthesized.
- Supported formats: **MP3** or **OGG**. If you have both for the same
  sound, the MP3 is used.

## Music beds (looping background music)

One file per row, named exactly as shown (`.mp3` or `.ogg`):

| Filename | Mood it should carry |
| --- | --- |
| `music-home.mp3` | ____'s bedroom — warm, cozy, safe. A gentle major-key pad, unhurried. |
| `music-path.mp3` | The outdoor path between houses — open, airy, a little breezy. Not sad, not tense. |
| `music-friendone.mp3` | ____'s fishing minigame — soft, watery, a little playful. Think calm pond, light plucked notes. |
| `music-split.mp3` | SPLIT.EXE (the shooter minigame) — low, tense, but not aggressive or harsh. Sparse and focused, like held breath. |
| `music-ending.mp3` | The ocean-galaxy ending — huge, slow, emotional swell. Should feel like it keeps building and opening up. |
| `music-letters.mp3` | The post-ending letters screen — a softer, quieter cousin of the home theme. Warm and settled. |

## Sound effects (short one-shot sounds)

| Filename | What it's for |
| --- | --- |
| `sfx-interact.mp3` | Tapping/clicking on something interactable in the world. Small, soft blip. |
| `sfx-dialogue-advance.mp3` | Advancing a line of dialogue. Tiny, quick tick — should not get annoying when spammed. |
| `sfx-keepsake.mp3` | Collecting a keepsake. Sweet, rewarding, a little chime that rises in pitch. |
| `sfx-letter-open.mp3` | Opening one of the friend letters. Soft paper-ish rustle plus a gentle tone. |
| `sfx-shot.mp3` | ____ fires her weapon in SPLIT.EXE. Should be soft — a "pew," not a bang. Not harsh or startling. |
| `sfx-hit.mp3` | A bot takes a body shot. A short, low thud. |
| `sfx-headshot.mp3` | A bot takes a headshot (instant kill). Brighter and more emphatic than a regular hit. |
| `sfx-heart-loss.mp3` | ____ takes damage and loses a heart. A short, sad descending sound. Not scary. |
| `sfx-spike-beep.mp3` | One beep of the spike's arming countdown. The game plays this repeatedly and speeds it up itself — you only need to provide a single clean beep sound. |
| `sfx-defuse-tick.mp3` | A tick during the spike defuse hold. Short, mechanical, satisfying. |
| `sfx-clutch.mp3` | The spike is defused — the big triumphant "you did it" moment. Bigger and brighter than the keepsake chime. |
| `sfx-boot-key.mp3` | A keypress sound during the cold-open "computer booting" screen. Very short, like a typewriter/keyboard click. |
| `sfx-ending-swell.mp3` | A one-shot swelling flourish for the ending's big emotional beat (separate from the looping `music-ending` bed — this is a single triggered moment, a few seconds long). |
| `sfx-paper-fold.mp3` | Folding a crease in the origami ritual. A soft, crisp paper fold — a short "shff," gentle and papery, not sharp. |
| `sfx-boat-expand.mp3` | The folded boat pops from flat into shape and its lantern catches. A gentle pop that blooms — a soft rounded "whoomp" opening up. |
| `sfx-water-lap.mp3` | A soft lap of water during the sail-away. Short and calm; the game retriggers it for a loose lapping rhythm. |

## Trying it out without playing the whole game

While running the dev server (`npm run dev`), you can preview any sound
directly from the browser's developer console (press F12 or Cmd+Option+I,
then click the "Console" tab) by pasting this in and pressing enter:

```js
const audio = await import('/src/game/audio.ts');
audio.initAudio(); // only needs to happen once per page load
audio.playMusic('music-home'); // try any music-* key from the table above
```

To try a sound effect instead:

```js
audio.playSfx('sfx-keepsake'); // try any sfx-* key from the table above
```

To stop the music:

```js
audio.stopMusic();
```

If you've dropped a real file in and want to hear it specifically (instead
of whatever the game happens to pick), the same commands above will use
your file automatically — there's no separate "test the synth version"
toggle, since the whole point is that you shouldn't need to think about
which one is playing.
