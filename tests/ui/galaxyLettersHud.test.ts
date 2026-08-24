import { beforeEach, describe, expect, it, vi } from 'vitest';
import { showGalaxyLettersHud } from '../../src/ui/galaxyLettersHud';

beforeEach(() => {
  document.body.innerHTML = '<div id="ui-root"></div>';
});

describe('showGalaxyLettersHud', () => {
  it('stays invisible until revealing the final go-home choice', () => {
    const onGoHome = vi.fn();
    const hud = showGalaxyLettersHud({ total: 2, onGoHome });
    const goHome = hud.element.querySelector<HTMLButtonElement>(
      '.galaxy-letters-hud__go-home',
    );
    expect(goHome?.textContent).toBe('go home');

    expect(hud.element.dataset.phase).toBe('playing');
    expect(hud.element.hidden).toBe(true);
    expect(hud.element.querySelectorAll('kbd')).toHaveLength(0);
    expect(goHome?.hidden).toBe(true);

    hud.setAwakening();
    expect(hud.element.dataset.phase).toBe('awakening');
    expect(hud.element.hidden).toBe(true);

    hud.setCollecting(1);
    expect(hud.element.dataset.phase).toBe('collecting');
    expect(hud.element.hidden).toBe(true);
    expect(goHome?.hidden).toBe(true);

    hud.setComplete();
    expect(hud.element.dataset.phase).toBe('complete');
    expect(hud.element.hidden).toBe(false);
    expect(hud.element.textContent).toContain('happy birthday, recipient.');
    expect(goHome?.hidden).toBe(false);

    goHome?.click();
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it('can be removed when the scene restarts', () => {
    const hud = showGalaxyLettersHud({ total: 1, onGoHome: () => undefined });
    hud.destroy();
    expect(document.querySelector('[data-galaxy-letters-hud]')).toBeNull();
  });
});
