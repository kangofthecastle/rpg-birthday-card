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
  key: 'recipient-idle-walk-8dir',
  url: '/assets/sprites/characters/recipient-idle-walk-8dir-v1-alpha.png',
  frameWidth: 256,
  frameHeight: 256,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  idleFrameRate: 4,
  walkFrameRate: 10,
  idleBobPixels: 1.25,
  idleBobDurationMs: 900,
} as const;

export const RECIPIENT_IDLE_ROW_START_FRAME: Record<PlayerFacing, number> = {
  down: 0,
  'down-left': 6,
  left: 12,
  'up-left': 18,
  up: 24,
  'up-right': 30,
  right: 36,
  'down-right': 42,
};

export const RECIPIENT_WALK_ROW_START_FRAME: Record<PlayerFacing, number> = {
  down: 48,
  'down-left': 54,
  left: 60,
  'up-left': 66,
  up: 72,
  'up-right': 78,
  right: 84,
  'down-right': 90,
};

export const RECIPIENT_IDLE_FRAME_COUNTS: Record<PlayerFacing, number> = {
  down: 6,
  'down-left': 6,
  left: 6,
  'up-left': 6,
  up: 6,
  'up-right': 6,
  right: 6,
  'down-right': 6,
};

export const RECIPIENT_ANIMATION_SOURCE_FACING: Record<PlayerFacing, PlayerFacing> = {
  down: 'down',
  'down-left': 'down-left',
  left: 'left',
  'up-left': 'up-left',
  up: 'up',
  'up-right': 'up-left',
  right: 'left',
  'down-right': 'down-left',
};

export const RECIPIENT_FLIP_X_BY_FACING: Record<PlayerFacing, boolean> = {
  down: false,
  'down-left': false,
  left: false,
  'up-left': false,
  up: false,
  'up-right': true,
  right: true,
  'down-right': true,
};

export const RECIPIENT_WALK_FRAME_COUNTS: Record<PlayerFacing, number> = {
  down: 6,
  'down-left': 6,
  left: 6,
  'up-left': 6,
  up: 6,
  'up-right': 6,
  right: 6,
  'down-right': 6,
};

export const RECIPIENT_TAP_STEP_FRAME_OFFSETS: Record<PlayerFacing, readonly number[]> = {
  down: [1, 2, 3, 4],
  'down-left': [1, 2, 3, 4],
  left: [1, 2, 3, 4],
  'up-left': [1, 2, 3, 4],
  up: [1, 2, 3, 4],
  'up-right': [1, 2, 3, 4],
  right: [1, 2, 3, 4],
  'down-right': [1, 2, 3, 4],
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
