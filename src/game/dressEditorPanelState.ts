// Pure state helpers for the dressEdit tool's draggable/collapsible control
// panel. Kept DOM-free and side-effect-light (localStorage access is guarded)
// so the geometry + persistence logic is unit-testable without a browser.
//
// The panel position is the fixed-position top-left corner in CSS pixels; the
// collapsed flag shrinks it to just its title bar. Both persist across editor
// sessions so re-opening dressEdit restores where the author last parked it.

const PANEL_STORAGE_KEY = 'a-game-dress-editor-panel';

export interface DressEditorPanelState {
  /** Fixed-position left offset (CSS px). */
  x: number;
  /** Fixed-position top offset (CSS px). */
  y: number;
  collapsed: boolean;
}

/**
 * Clamp a panel's top-left corner so the whole panel stays inside the viewport
 * (kept `margin` px from every edge). When the panel is larger than the space
 * available, the lower bound wins so its top-left stays reachable rather than
 * pushing the title bar off the top/left edge.
 */
export function clampPanelPosition(
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, viewportWidth - panelWidth - margin);
  const maxY = Math.max(margin, viewportHeight - panelHeight - margin);
  return {
    x: clamp(x, margin, maxX),
    y: clamp(y, margin, maxY),
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Parse a persisted panel state, tolerating absent/corrupt/partial JSON. */
export function parsePanelState(raw: string | null): DressEditorPanelState | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const v = value as Record<string, unknown>;
    if (typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
      return null;
    }
    return { x: v.x, y: v.y, collapsed: v.collapsed === true };
  } catch {
    return null;
  }
}

/** Read the persisted panel state (localStorage-guarded; null if unavailable). */
export function loadPanelState(): DressEditorPanelState | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    return parsePanelState(localStorage.getItem(PANEL_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist the panel state (localStorage-guarded; a no-op if it throws). */
export function savePanelState(state: DressEditorPanelState): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full / disabled / private mode — the panel just won't persist.
  }
}
