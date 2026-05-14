export type PlayerFacing =
  | 'down'
  | 'down-left'
  | 'left'
  | 'up-left'
  | 'up'
  | 'up-right'
  | 'right'
  | 'down-right';

export const PLAYER_FACINGS: readonly PlayerFacing[] = [
  'down',
  'down-left',
  'left',
  'up-left',
  'up',
  'up-right',
  'right',
  'down-right',
];

export const RECIPIENT_SPRITE = {
  key: 'recipient-walk-8dir',
  url: '/assets/sprites/characters/recipient-walk-8dir-v1-alpha.png',
  frameWidth: 256,
  frameHeight: 256,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  walkFrameRate: 10,
  idleBobPixels: 1.25,
  idleBobDurationMs: 900,
} as const;

export const RECIPIENT_ROW_START_FRAME: Record<PlayerFacing, number> = {
  down: 0,
  'down-left': 8,
  left: 16,
  'up-left': 24,
  up: 32,
  'up-right': 40,
  right: 48,
  'down-right': 56,
};

export const RECIPIENT_WALK_FRAME_COUNTS: Record<PlayerFacing, number> = {
  down: 8,
  'down-left': 8,
  left: 8,
  'up-left': 8,
  up: 8,
  'up-right': 8,
  right: 8,
  'down-right': 8,
};

export const RECIPIENT_IDLE_FRAME_OFFSETS: Record<PlayerFacing, number> = {
  down: 0,
  'down-left': 2,
  left: 2,
  'up-left': 2,
  up: 0,
  'up-right': 2,
  right: 2,
  'down-right': 2,
};

export const RECIPIENT_TAP_STEP_FRAME_OFFSETS: Record<PlayerFacing, readonly number[]> = {
  down: [1, 2, 4, 6],
  'down-left': [1, 2, 4, 6],
  left: [1, 2, 4, 6],
  'up-left': [1, 2, 4, 6],
  up: [1, 2, 4, 6],
  'up-right': [1, 2, 4, 6],
  right: [1, 2, 4, 6],
  'down-right': [1, 2, 4, 6],
};

export const RECIPIENT_TAP_STEP_HOLD_MS = 140;

export const RECIPIENT_WALK_DUST = {
  key: 'recipient-walk-dust-puff',
  intervalMs: 90,
  lifespanMs: 300,
  footYOffset: -1,
  sideOffsetPixels: 13,
  jitterPixels: 2,
  startScale: 0.8,
  endScale: 1.3,
  alpha: 0.75,
  color: 0xf6deb0,
} as const;

export const RECIPIENT_WALK_ANIMATIONS: Record<PlayerFacing, string> = {
  down: 'recipient-walk-down',
  'down-left': 'recipient-walk-down-left',
  left: 'recipient-walk-left',
  'up-left': 'recipient-walk-up-left',
  up: 'recipient-walk-up',
  'up-right': 'recipient-walk-up-right',
  right: 'recipient-walk-right',
  'down-right': 'recipient-walk-down-right',
};

export const RECIPIENT_IDLE_ANIMATIONS: Record<PlayerFacing, string> = {
  down: 'recipient-idle-down',
  'down-left': 'recipient-idle-down-left',
  left: 'recipient-idle-left',
  'up-left': 'recipient-idle-up-left',
  up: 'recipient-idle-up',
  'up-right': 'recipient-idle-up-right',
  right: 'recipient-idle-right',
  'down-right': 'recipient-idle-down-right',
};
