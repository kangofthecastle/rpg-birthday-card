# A-Game

A short birthday adventure made for ____.

____ wakes up in a familiar world that is not quite hers. She visits ____ and
____, plays the games waiting on their computers, collects a few keepsakes,
and follows a song toward a final celebration under the stars.

Built with Phaser 3, TypeScript, and Vite, with Electron packaging for Windows
and macOS. Best played in one sitting with sound on.

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Controls

- WASD or arrow keys — move
- E — interact
- Enter, Space, or click — continue dialogue
- M — mute
- Esc — leave an activity

Each minigame shows its own controls. The game includes fishing, RETAKE.EXE, a
violin performance, Boatigami, a galaxy finale with ten letter-stars, and a
post-ending photo wall.

## Development

```bash
npm test          # unit and component tests
npm run build     # type-check and production build
npm run smoke     # Playwright end-to-end tests
npm run package   # desktop package for the current OS
```

Install Playwright's browser once with:

```bash
npx playwright install chromium
```

## Personal content

- Galaxy letters and photos: `src/content/galaxyLetters.ts`
- ____'s letter archive: `src/content/letters.ts`
- Photo wall: `public/assets/photos/manifest.json`
- Optional audio: `public/audio/README.md`
- Replaceable art: `public/assets/README.md`
