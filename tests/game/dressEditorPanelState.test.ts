import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampPanelPosition,
  loadPanelState,
  parsePanelState,
  savePanelState,
} from '../../src/game/dressEditorPanelState';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe('clampPanelPosition', () => {
  it('keeps a panel fully inside the viewport with a margin', () => {
    // Comfortably inside — returned unchanged.
    expect(clampPanelPosition(100, 100, 220, 300, 1280, 720, 8)).toEqual({ x: 100, y: 100 });
  });

  it('pulls a panel back from beyond the right/bottom edges', () => {
    const { x, y } = clampPanelPosition(5000, 5000, 220, 300, 1280, 720, 8);
    expect(x).toBe(1280 - 220 - 8);
    expect(y).toBe(720 - 300 - 8);
  });

  it('clamps negative (off top-left) positions up to the margin', () => {
    expect(clampPanelPosition(-500, -500, 220, 300, 1280, 720, 8)).toEqual({ x: 8, y: 8 });
  });

  it('keeps the top-left reachable when the panel is larger than the viewport', () => {
    // maxX < margin would invert the clamp; the lower bound must win.
    expect(clampPanelPosition(200, 200, 2000, 2000, 800, 600, 8)).toEqual({ x: 8, y: 8 });
  });
});

describe('parsePanelState', () => {
  it('returns null for empty/corrupt/partial input', () => {
    expect(parsePanelState(null)).toBeNull();
    expect(parsePanelState('not json')).toBeNull();
    expect(parsePanelState('42')).toBeNull();
    expect(parsePanelState('{"x":1}')).toBeNull();
    expect(parsePanelState('{"x":"a","y":2}')).toBeNull();
  });

  it('parses a valid state and defaults collapsed to false', () => {
    expect(parsePanelState('{"x":40,"y":60}')).toEqual({ x: 40, y: 60, collapsed: false });
    expect(parsePanelState('{"x":40,"y":60,"collapsed":true}')).toEqual({
      x: 40,
      y: 60,
      collapsed: true,
    });
  });

  it('rejects non-finite coordinates', () => {
    expect(parsePanelState('{"x":null,"y":2}')).toBeNull();
  });
});

describe('load/save round-trip', () => {
  it('persists and restores through localStorage', () => {
    expect(loadPanelState()).toBeNull();
    savePanelState({ x: 123, y: 45, collapsed: true });
    expect(loadPanelState()).toEqual({ x: 123, y: 45, collapsed: true });
  });
});
