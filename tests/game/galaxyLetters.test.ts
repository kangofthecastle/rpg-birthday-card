import { describe, expect, it } from 'vitest';
import {
  areAllGalaxyLettersLit,
  areAllGalaxyLettersRead,
  canCollectGalaxyLetter,
  createGalaxyLetterState,
  layoutGalaxyLetterStars,
  lightAllGalaxyLetters,
  readGalaxyLetter,
} from '../../src/game/galaxyLetters';
import { GALAXY_STAR_VARIANTS } from '../../src/content/galaxyScene';

describe('galaxy letter ending', () => {
  it('cycles several painted flare variants across the letter-stars', () => {
    expect(GALAXY_STAR_VARIANTS).toHaveLength(4);
    expect(new Set(GALAXY_STAR_VARIANTS.map(({ key }) => key)).size).toBe(4);
    expect(GALAXY_STAR_VARIANTS.every(({ url }) => url.endsWith('.png'))).toBe(true);
  });

  it('lights every letter-star with one violin action', () => {
    const start = createGalaxyLetterState(10);
    const lit = lightAllGalaxyLetters(start);

    expect(start.lit).toBe(0);
    expect(lit.lit).toBe(10);
    expect(lightAllGalaxyLetters(lit)).toBe(lit);
    expect(areAllGalaxyLettersLit(lit)).toBe(true);
  });

  it('only lets ____ collect stars the violin has awakened', () => {
    const start = createGalaxyLetterState(2);
    expect(canCollectGalaxyLetter(start, 0)).toBe(false);

    const lit = lightAllGalaxyLetters(start);
    expect(canCollectGalaxyLetter(lit, 0)).toBe(true);
    expect(canCollectGalaxyLetter(lit, 1)).toBe(true);

    const read = readGalaxyLetter(lit, 0);
    expect(read.read).toEqual([0]);
    expect(canCollectGalaxyLetter(read, 0)).toBe(false);
    expect(readGalaxyLetter(read, 0)).toBe(read);
  });

  it('completes only after every lit star has been read', () => {
    let state = createGalaxyLetterState(2);
    state = lightAllGalaxyLetters(state);
    state = readGalaxyLetter(state, 0);
    expect(areAllGalaxyLettersRead(state)).toBe(false);
    state = readGalaxyLetter(state, 1);
    expect(areAllGalaxyLettersRead(state)).toBe(true);
  });

  it('dots one reachable star per authored letter across the galaxy', () => {
    expect(layoutGalaxyLetterStars(0)).toEqual([]);
    expect(layoutGalaxyLetterStars(1)).toEqual([{ x: 180, y: 176 }]);
    expect(layoutGalaxyLetterStars(10)).toEqual([
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
    ]);
    const expanded = layoutGalaxyLetterStars(24);
    expect(expanded).toHaveLength(24);
    expect(new Set(expanded.map(({ x, y }) => `${x},${y}`)).size).toBe(24);
  });
});
