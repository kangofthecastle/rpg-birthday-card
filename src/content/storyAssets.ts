export const STORY_KOI_BOWL_ONE_KEY = 'story-koi-bowl-one';
export const STORY_KOI_BOWL_TWO_KEY = 'story-koi-bowl-two';
export const CLEARING_KOI_KEY = 'story-clearing-koi';
export const FINALE_OMEN_KEY = 'story-finale-omen';
export const FINALE_OMEN_DISPLAY_SIZE = { width: 82, height: 102 } as const;
export const EPILOGUE_BOAT_PHOTO_KEY = 'story-epilogue-boat-photo';

/** Normalized to the tightly cropped ____ desk prop, not the whole room. */
export const FRIEND_ONE_PC_GLASS_CUE = {
  bounds: { left: 0.295, top: 0.05, width: 0.37, height: 0.18 },
  gradient: [0xaeefff, 0x7edcff, 0x4faedc, 0x277cae],
} as const;

/** Placement for the epilogue mail icon, normalized to ____'s desk prop. */
export const RECIPIENT_PC_MAIL_CUE = {
  screenBounds: { left: 0.3875, top: 0.1025, width: 0.23, height: 0.1425 },
  color: 0xffd75a,
} as const;
