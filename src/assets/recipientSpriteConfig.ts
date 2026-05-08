export type PlayerFacing = 'down' | 'left' | 'right' | 'up';

export const PLAYER_FACINGS: readonly PlayerFacing[] = ['down', 'left', 'right', 'up'];

export const RECIPIENT_SPRITE = {
  key: 'recipient-walk-4dir',
  url: '/assets/sprites/characters/recipient-walk-4dir-v1-alpha.png',
  frameWidth: 256,
  frameHeight: 256,
  scale: 0.45,
  origin: { x: 0.5, y: 1 },
  walkFrameRate: 8,
  idleBobPixels: 1.25,
  idleBobDurationMs: 900,
} as const;

export const RECIPIENT_ROW_START_FRAME: Record<PlayerFacing, number> = {
  down: 0,
  left: 6,
  right: 12,
  up: 18,
};

export const RECIPIENT_WALK_ANIMATIONS: Record<PlayerFacing, string> = {
  down: 'recipient-walk-down',
  left: 'recipient-walk-left',
  right: 'recipient-walk-right',
  up: 'recipient-walk-up',
};

export const RECIPIENT_IDLE_ANIMATIONS: Record<PlayerFacing, string> = {
  down: 'recipient-idle-down',
  left: 'recipient-idle-left',
  right: 'recipient-idle-right',
  up: 'recipient-idle-up',
};
