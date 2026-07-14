export type LaunchMode = 'story' | 'cards';

let launchMode: LaunchMode = 'story';

/**
 * Carries the cold-open choice into Phaser without putting it in a save, URL,
 * or other persistent state. A fresh page load always starts in story mode.
 */
export function setLaunchMode(mode: LaunchMode): void {
  launchMode = mode;
}

export function getLaunchMode(): LaunchMode {
  return launchMode;
}
