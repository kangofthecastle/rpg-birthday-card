export interface RibbonMoteMotion {
  readonly startX: number;
  readonly startY: number;
  readonly endY: number;
  readonly swayX: number;
  readonly delayMs: number;
  readonly runMs: number;
  readonly scale: number;
  readonly peakAlpha: number;
}

export interface RibbonMoteFrame {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

export interface BreathingMoteMotion {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly moveDelayMs: number;
  readonly moveDurationMs: number;
  readonly alphaDelayMs: number;
  readonly alphaDurationMs: number;
  readonly alphaHoldMs: number;
  readonly alphaRepeatDelayMs: number;
  readonly lowAlpha: number;
  readonly peakAlpha: number;
  readonly scale: number;
}

function sineInOut(t: number): number {
  return 0.5 - Math.cos(Math.PI * t) * 0.5;
}

/**
 * Samples the exact looping path formerly produced by the three Phaser tweens
 * attached to each beckoning mote: linear northward travel, a yoyoing lateral
 * sway, and a 12% fade-in / 76% hold / 12% fade-out alpha envelope.
 */
export function sampleRibbonMote(
  motion: RibbonMoteMotion,
  elapsedMs: number,
): RibbonMoteFrame {
  if (elapsedMs < motion.delayMs) {
    return { x: motion.startX, y: motion.startY, alpha: 0 };
  }

  const cycleMs = (elapsedMs - motion.delayMs) % motion.runMs;
  const t = cycleMs / motion.runMs;
  const swayT = t < 0.5 ? sineInOut(t * 2) : 1 - sineInOut((t - 0.5) * 2);

  let alpha: number;
  if (t < 0.12) {
    alpha = motion.peakAlpha * sineInOut(t / 0.12);
  } else if (t <= 0.88) {
    alpha = motion.peakAlpha;
  } else {
    alpha = motion.peakAlpha * (1 - sineInOut((t - 0.88) / 0.12));
  }

  return {
    x: motion.startX + motion.swayX * swayT,
    y: motion.startY + (motion.endY - motion.startY) * t,
    alpha,
  };
}

/** Samples the two independent yoyo tweens used by the indoor dust motes. */
export function sampleBreathingMote(
  motion: BreathingMoteMotion,
  elapsedMs: number,
): RibbonMoteFrame {
  let moveT = 0;
  if (elapsedMs >= motion.moveDelayMs) {
    const moveCycle = motion.moveDurationMs * 2;
    const moveElapsed = (elapsedMs - motion.moveDelayMs) % moveCycle;
    const raw = moveElapsed / motion.moveDurationMs;
    moveT = raw <= 1 ? sineInOut(raw) : 1 - sineInOut(raw - 1);
  }

  let alpha = 0;
  if (elapsedMs >= motion.alphaDelayMs) {
    const alphaCycle =
      motion.alphaDurationMs * 2 +
      motion.alphaHoldMs +
      motion.alphaRepeatDelayMs;
    const alphaElapsed = (elapsedMs - motion.alphaDelayMs) % alphaCycle;
    if (alphaElapsed < motion.alphaDurationMs) {
      const t = sineInOut(alphaElapsed / motion.alphaDurationMs);
      alpha = motion.lowAlpha + (motion.peakAlpha - motion.lowAlpha) * t;
    } else if (alphaElapsed < motion.alphaDurationMs + motion.alphaHoldMs) {
      alpha = motion.peakAlpha;
    } else if (alphaElapsed < motion.alphaDurationMs * 2 + motion.alphaHoldMs) {
      const t = sineInOut(
        (alphaElapsed - motion.alphaDurationMs - motion.alphaHoldMs) /
          motion.alphaDurationMs,
      );
      alpha = motion.peakAlpha + (motion.lowAlpha - motion.peakAlpha) * t;
    } else {
      alpha = motion.lowAlpha;
    }
  }

  return {
    x: motion.startX + (motion.endX - motion.startX) * moveT,
    y: motion.startY + (motion.endY - motion.startY) * moveT,
    alpha,
  };
}
