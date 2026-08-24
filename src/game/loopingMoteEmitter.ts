import Phaser from 'phaser';
import {
  sampleBreathingMote,
  sampleRibbonMote,
  type BreathingMoteMotion,
  type RibbonMoteMotion,
} from './loopingMoteMotion';

export type { BreathingMoteMotion, RibbonMoteMotion } from './loopingMoteMotion';

class RibbonMoteParticle extends Phaser.GameObjects.Particles.Particle {
  private motion?: RibbonMoteMotion;
  private elapsedMs = 0;

  configure(motion: RibbonMoteMotion): void {
    this.motion = motion;
    this.elapsedMs = 0;
    this.scaleX = motion.scale;
    this.scaleY = motion.scale;
    const frame = sampleRibbonMote(motion, 0);
    this.x = frame.x;
    this.y = frame.y;
    this.alpha = frame.alpha;
  }

  override update(
    delta: number,
    _step: number,
    _processors: Phaser.GameObjects.Particles.ParticleProcessor[],
  ): boolean {
    const motion = this.motion;
    if (!motion) {
      return false;
    }
    this.elapsedMs += delta;
    const frame = sampleRibbonMote(motion, this.elapsedMs);
    this.x = frame.x;
    this.y = frame.y;
    this.alpha = frame.alpha;
    return false;
  }
}

class BreathingMoteParticle extends Phaser.GameObjects.Particles.Particle {
  private motion?: BreathingMoteMotion;
  private elapsedMs = 0;

  configure(motion: BreathingMoteMotion): void {
    this.motion = motion;
    this.elapsedMs = 0;
    this.scaleX = motion.scale;
    this.scaleY = motion.scale;
    const frame = sampleBreathingMote(motion, 0);
    this.x = frame.x;
    this.y = frame.y;
    this.alpha = frame.alpha;
  }

  override update(
    delta: number,
    _step: number,
    _processors: Phaser.GameObjects.Particles.ParticleProcessor[],
  ): boolean {
    const motion = this.motion;
    if (!motion) {
      return false;
    }
    this.elapsedMs += delta;
    const frame = sampleBreathingMote(motion, this.elapsedMs);
    this.x = frame.x;
    this.y = frame.y;
    this.alpha = frame.alpha;
    return false;
  }
}

/**
 * Renders every mote through one ParticleEmitter. Phaser batches the particles
 * into one additive draw instead of treating each mote as an independent scene
 * object, while RibbonMoteParticle preserves the approved animation exactly.
 */
export function createRibbonMoteEmitter(
  scene: Phaser.Scene,
  textureKey: string,
  motions: readonly RibbonMoteMotion[],
  depth: number,
): Phaser.GameObjects.Particles.ParticleEmitter {
  let motionIndex = 0;
  const emitter = scene.add
    .particles(0, 0, textureKey, {
      emitting: false,
      maxParticles: motions.length,
      particleClass: RibbonMoteParticle,
      lifespan: Number.MAX_SAFE_INTEGER,
      alpha: 0,
    })
    .setDepth(depth)
    .setBlendMode(Phaser.BlendModes.ADD);

  emitter.emitCallback = (particle) => {
    const motion = motions[motionIndex];
    motionIndex += 1;
    if (motion) {
      (particle as RibbonMoteParticle).configure(motion);
    }
  };
  emitter.emitParticle(motions.length, 0, 0);
  return emitter;
}

export function createBreathingMoteEmitter(
  scene: Phaser.Scene,
  textureKey: string,
  motions: readonly BreathingMoteMotion[],
): Phaser.GameObjects.Particles.ParticleEmitter {
  let motionIndex = 0;
  const emitter = scene.add
    .particles(0, 0, textureKey, {
      emitting: false,
      maxParticles: motions.length,
      particleClass: BreathingMoteParticle,
      lifespan: Number.MAX_SAFE_INTEGER,
      alpha: 0,
    })
    .setBlendMode(Phaser.BlendModes.ADD);

  emitter.emitCallback = (particle) => {
    const motion = motions[motionIndex];
    motionIndex += 1;
    if (motion) {
      (particle as BreathingMoteParticle).configure(motion);
    }
  };
  emitter.emitParticle(motions.length, 0, 0);
  return emitter;
}
