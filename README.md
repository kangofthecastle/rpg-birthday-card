# RPG Birthday Card

A small RPG made to be a birthday card you can play. Instead of opening a card,
the recipient explores a village, visits two friends, plays activities connected
to them, and collects letters and sheet music. Those keepsakes become a paper
boat that takes them to a birthday celebration under the stars. The ending has
letter-stars to open and a photo wall to revisit afterward.

The original was a personal gift. This public version removes the original
letters and photographs and displays people’s names as `____`. It keeps the game,
its illustrations, and placeholder content so you can make your own version.
It uses Phaser, TypeScript, and Vite, with Electron packaging for desktop builds.

## Try it locally

Install Node.js 22 or newer, then:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite, normally <http://127.0.0.1:5173>.
Sound is part of the experience; the game is designed for one sitting.

Controls:

- WASD or arrow keys: move.
- E: interact.
- Enter, Space, or click: continue dialogue.
- M: mute.
- Esc: leave an activity or close an overlay.

Each activity explains its own controls. Activities include fishing, a small
shooter, a violin performance, and folding keepsakes into a boat. A blank photo
manifest renders placeholder frames, and omitted letter textures use the
procedural paper rendering.

## Make it your own with Claude or Codex

You can work with a coding assistant in a local clone of this repository. Keep
that working copy private while you add personal content. If you want a GitHub
copy, create a new **private** repository and push your copy there; GitHub forks
of public repositories cannot be made private.

### 1. Get the unchanged game running

Clone this repository, install dependencies, and run it before asking the
assistant to make changes. Open the repository folder in your coding assistant.
Begin with a small, inspectable request:

> Read README.md and inspect the content files. Explain how the story progresses,
> where names and dialogue are defined, and where the two friend letters and
> constellation letters are stored. Do not edit anything yet.

### 2. Personalize the characters and dialogue

The internal roles are `recipient`, `friendone`, and `friendtwo`. Those IDs tie
maps, sprites, portraits, and story gates together. Displayed names are `____`.
Give the assistant each role’s intended name and your approved dialogue. Ask it
to update the displayed text while preserving the internal IDs.

> Set the recipient’s displayed name to [name], the first friend’s to [name], and
> the second friend’s to [name]. Use portrait-recipient, portrait-friendone, and
> portrait-friend-b to identify speakers. Update the corresponding house titles
> and keepsake labels. Keep map IDs, sprite keys, and story gates unchanged. Show
> me the text changes; do not invent personal memories or rewrite other dialogue.

Do not globally replace every `____` with one name: different characters use the
same placeholder. Ask the assistant to inspect each occurrence in context.

Useful files:

| File | What to change |
| --- | --- |
| `src/content/storyContent.ts` | Opening and progression dialogue |
| `src/content/locations.ts` | Houses, interactions, keepsakes, first friend’s letter |
| `src/content/finaleDialogue.ts` | Final conversation |
| `src/content/letters.ts` | Second friend’s letter and archive identity |
| `src/content/galaxyLetters.ts` | The constellation’s birthday messages |
| `src/activities/finalKeepsake/endingModel.ts` | Final birthday line |
| `src/activities/foldTheLetters/foldModel.ts` | Letter snippets on the folded boat |

### 3. Add letters and optional photos

Replace the placeholder `text` and `from` fields with messages you have permission
to include. Keep each letter’s `id` unique: two people can share a displayed name
without their letters being merged. The template has twelve constellation
messages, but you can ask the assistant to adjust the count and verify the layout.

For example:

```ts
{
  id: 'constellation-1',
  from: 'Your friend’s name',
  text: 'Their own birthday message.',
  // Photos are optional:
  photoSrc: '/assets/photos/memory-01.jpg',
  photoAlt: 'Describe the photograph for someone who cannot see it.',
  photoCaption: 'Your own caption.',
}
```

For the photo wall, put your images in `public/assets/photos/` and list their
filenames in `public/assets/photos/manifest.json`. See that folder’s README for
an example. Image additions there are ignored by Git by default; letter text,
names, and manifest captions are not. Do not upload other people’s private
material to a public repo or to a coding assistant without their permission.

> Add these approved messages to the letter slots and these approved images to
> the photo wall. Keep stable letter IDs and preserve the first friend / second
> friend archive order. Verify that every image path resolves and every letter
> remains separately selectable. Do not commit or push my personal content.

### 4. Change the art or activities gradually

Start by adapting an existing activity, rather than changing every scene at once.
Explain what the recipient enjoys, specify the behavior you want, and ask for a
small change that preserves the reward and story progression.

> Adapt [activity] around [interest]. Keep its completion contract and keepsake
> reward so the rest of the story still works. First explain which files need
> changes, then implement only the agreed scope. Run the relevant tests and build.

The art slots are documented in `public/assets/README.md`. Pixel sprites,
portraits, room props, and maps have different size and frame requirements;
ask the assistant to inspect those before replacing files. Personal letter
textures are deliberately absent from this template. You can use the procedural
paper or add your own textures in a private copy.

### 5. Play the whole gift and package it

```bash
npm test
npm run build
npx playwright install chromium
npm run smoke
npm run package
```

`npm run package` creates a desktop build for your current operating system in
`dist-electron/`. The included release workflow can build Windows and macOS
artifacts when you create a version tag. Unsigned desktop builds may show an
operating-system trust prompt. Make a private test build and play through the
opening, both friend activities, violin, boat folding, letter-stars, and photo
wall before sending the gift.

A helpful final prompt:

> Review this as a birthday gift. Check progression, missing assets, letter
> identities, photo captions, controls, and the complete ending. Report build and
> test results separately from what you manually verified. Do not publish it.

## Development history and privacy

This repository preserves a sanitized copy of the original development history.
Private content files, photographs, letter textures, and internal development
notes were removed from historical revisions. Character IDs and personal names
were anonymized. Commit authors and dates were retained, commit IDs changed, and
commits containing only removed content may no longer appear. The original
private repository remains separate.

Some old revisions will not run on their own because their private content
modules were removed. Use the current default branch for the playable template.
Deleting a file in a later commit does not erase its earlier versions. If you
personalize this gift, keep its repository private from the start.

Third-party asset attribution remains alongside the relevant audio assets.
