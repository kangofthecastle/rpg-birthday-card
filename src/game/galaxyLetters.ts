export interface GalaxyLetterState {
  readonly total: number;
  /** Number of letter-stars awakened by the violin. */
  readonly lit: number;
  /** Letter indexes whose star has been collected and read. */
  readonly read: readonly number[];
}

export interface GalaxyLetterStarPosition {
  readonly x: number;
  readonly y: number;
}

export function createGalaxyLetterState(total: number): GalaxyLetterState {
  return {
    total: Math.max(0, Math.floor(total)),
    lit: 0,
    read: [],
  };
}

/** The finale's one sustained violin note wakes every letter-star. */
export function lightAllGalaxyLetters(state: GalaxyLetterState): GalaxyLetterState {
  if (state.lit >= state.total) {
    return state;
  }
  return { ...state, lit: state.total };
}

export function canCollectGalaxyLetter(state: GalaxyLetterState, index: number): boolean {
  return index >= 0 && index < state.lit && !state.read.includes(index);
}

export function readGalaxyLetter(state: GalaxyLetterState, index: number): GalaxyLetterState {
  if (!canCollectGalaxyLetter(state, index)) {
    return state;
  }
  return { ...state, read: [...state.read, index] };
}

export function areAllGalaxyLettersLit(state: GalaxyLetterState): boolean {
  return state.lit >= state.total;
}

export function areAllGalaxyLettersRead(state: GalaxyLetterState): boolean {
  return state.read.length >= state.total;
}

/**
 * Authored landing spots dotted across the playable galaxy. Their order jumps
 * between distant parts of the map so even a smaller final letter count still
 * feels scattered instead of clustering around ____.
 */
const GALAXY_LETTER_STAR_SPOTS: readonly GalaxyLetterStarPosition[] = [
  { x: 180, y: 176 },
  { x: 1190, y: 780 },
  { x: 1130, y: 250 },
  { x: 240, y: 710 },
  { x: 520, y: 190 },
  { x: 980, y: 610 },
  { x: 340, y: 430 },
  { x: 1240, y: 470 },
  { x: 620, y: 840 },
  { x: 850, y: 330 },
  { x: 150, y: 540 },
  { x: 1080, y: 870 },
  { x: 760, y: 170 },
  { x: 470, y: 650 },
  { x: 1260, y: 350 },
  { x: 300, y: 290 },
  { x: 900, y: 840 },
  { x: 1040, y: 410 },
  { x: 530, y: 350 },
  { x: 790, y: 650 },
];

/** One reachable, independent star per authored letter. */
export function layoutGalaxyLetterStars(total: number): readonly GalaxyLetterStarPosition[] {
  const count = Math.max(0, Math.floor(total));
  if (count <= GALAXY_LETTER_STAR_SPOTS.length) {
    return GALAXY_LETTER_STAR_SPOTS.slice(0, count);
  }

  const positions = [...GALAXY_LETTER_STAR_SPOTS];
  for (let y = 120; y <= 900 && positions.length < count; y += 90) {
    for (let x = 120; x <= 1288 && positions.length < count; x += 96) {
      const clearOfExisting = positions.every(
        (spot) => Math.hypot(spot.x - x, spot.y - y) >= 70,
      );
      const clearOfFriendTwo = x < 550 || x > 850 || y < 330 || y > 590;
      if (clearOfExisting && clearOfFriendTwo) {
        positions.push({ x, y });
      }
    }
  }
  return positions.slice(0, count);
}
