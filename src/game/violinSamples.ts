export type ViolinArticulation = 'arco' | 'spiccato';

export interface ViolinSampleAnchor {
  readonly id: string;
  /** Written pitch used to choose the closest anchor. */
  readonly rootFrequency: number;
  /** Measured median fundamental of the recording, used to tune playback. */
  readonly recordedFrequency: number;
  readonly arcoUrl: string;
  readonly spiccatoUrl: string;
}

export interface SelectedViolinSample {
  readonly anchorId: string;
  readonly articulation: ViolinArticulation;
  readonly rootFrequency: number;
  readonly recordedFrequency: number;
  readonly playbackRate: number;
  readonly url: string;
}

const SAMPLE_BASE_URL = '/assets/audio/violin';

export const VIOLIN_SAMPLE_ANCHORS: readonly ViolinSampleAnchor[] = [
  {
    id: 'a3',
    rootFrequency: 220,
    recordedFrequency: 220.5,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-a3.ogg?v=stereo-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-a3.ogg?v=stereo-1`,
  },
  {
    id: 'c4',
    rootFrequency: 261.63,
    recordedFrequency: 260.947,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-iowa-c4.ogg?v=native-stereo-low-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-c4.ogg?v=stereo-1`,
  },
  {
    id: 'd4',
    rootFrequency: 293.66,
    recordedFrequency: 294,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-iowa-d4.ogg?v=native-stereo-low-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-c4.ogg?v=stereo-1`,
  },
  {
    id: 'e4',
    rootFrequency: 329.63,
    recordedFrequency: 331.579,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-e4.ogg?v=stereo-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-e4.ogg?v=stereo-1`,
  },
  {
    id: 'g4',
    rootFrequency: 392,
    recordedFrequency: 390.265,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-g4.ogg?v=stereo-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-g4.ogg?v=stereo-1`,
  },
  {
    id: 'a4',
    rootFrequency: 440,
    recordedFrequency: 441,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-a4.ogg?v=stereo-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-a4.ogg?v=stereo-1`,
  },
  {
    id: 'c5',
    rootFrequency: 523.25,
    recordedFrequency: 525,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-c5.ogg?v=stereo-1`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-c5.ogg?v=stereo-1`,
  },
] as const;

export const VIOLIN_SAMPLE_URLS: readonly string[] = VIOLIN_SAMPLE_ANCHORS.map(
  (anchor) => anchor.arcoUrl,
);

export function selectViolinSample(
  frequency: number,
  _durationMs: number,
): SelectedViolinSample {
  const safeFrequency = Math.max(1, frequency);
  const anchor = VIOLIN_SAMPLE_ANCHORS.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(Math.log2(safeFrequency / nearest.rootFrequency));
    const candidateDistance = Math.abs(Math.log2(safeFrequency / candidate.rootFrequency));
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
  // The game's fast melody values still use the smooth bowed recording. The
  // spiccato masters have a deliberately sharp bow bite that reads as an audio
  // artifact in this intimate scene; duration is shaped by the gain envelope.
  const articulation: ViolinArticulation = 'arco';

  return {
    anchorId: anchor.id,
    articulation,
    rootFrequency: anchor.rootFrequency,
    recordedFrequency: anchor.recordedFrequency,
    playbackRate: safeFrequency / anchor.recordedFrequency,
    url: anchor.arcoUrl,
  };
}
