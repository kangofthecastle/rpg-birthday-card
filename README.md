# A-Game

A cozy, browser-only, keyboard-driven RPG built as a birthday present for
____ — a small world she gets pulled into through a booting PC, with her
friends' houses to visit, a minigame inside each friend's computer, keepsakes
to collect, and an ending that washes the world away into an ocean under a
galaxy. One sitting, no save system, no fail states.

Built with Phaser 3, TypeScript, and Vite.

## Play

```bash
npm install
npx playwright install chromium   # once, for the smoke tests
npm run dev                       # open http://127.0.0.1:5173
```

Move with WASD/arrows, interact with E, advance dialogue with Enter/Space,
M mutes audio. SPLIT.EXE uses the mouse to aim.

## The flow

Boot screen → ____'s room (her PC says NO SIGNAL) → the path → ____'s house
(PC fishing game → Glowing Koi Scale) and ____'s house (SPLIT.EXE →
Defused Spike Charm) → home again (her PC has woken up → Golden Hour Photo)
→ the Lantern Clearing unlocks → the ending → letters.

## For ____, before gifting

- **Letters**: paste friends' letters into `src/content/letters.ts` — plain
  `{ from, text }` entries, instructions in the file.
- **Music** (optional): drop files into `public/audio/` named per
  `public/audio/README.md`. Anything missing falls back to built-in synth.
- **Playtest**: `npm run dev` and play start to finish once.

## Development

```bash
npm test          # vitest unit tests
npm run build     # typecheck + production build
npm run smoke     # Playwright end-to-end suite (boots real browser)
node scripts/write-dev-maps.mjs   # regenerate public/maps/*.tmj (never hand-edit those)
```

Design docs live in `docs/superpowers/specs/` (see
`2026-07-07-recipient-birthday-closeout.md` for the shipped design). Asset
inventory and status: `src/assets/assetManifest.ts`. Image-generation
prompts used for the art: `docs/assets/codex-prompts/`.

Useful dev query params: `?testMode=1` (skip boot overlay, jump to a
location — see BootScene for `location`/`spawn`/`seedKeepsakes`) and
`?dressDebug=1` (overlay interact rects and prop colliders in dressed rooms).
