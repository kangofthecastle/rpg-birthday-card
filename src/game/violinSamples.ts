export type ViolinArticulation = 'arco' | 'spiccato';

export interface ViolinSampleAnchor {
  readonly id: string;
  readonly rootFrequency: number;
  readonly arcoUrl: string;
  readonly spiccatoUrl: string;
}

export interface SelectedViolinSample {
  readonly anchorId: string;
  readonly articulation: ViolinArticulation;
  readonly rootFrequency: number;
  readonly playbackRate: number;
  readonly url: string;
}

const SAMPLE_BASE_URL = '/assets/audio/violin';

export const VIOLIN_SAMPLE_ANCHORS: readonly ViolinSampleAnchor[] = [
  {
    id: 'a3',
    rootFrequency: 220,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-a3.ogg`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-a3.ogg`,
  },
  {
    id: 'c4',
    rootFrequency: 261.63,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-c4.ogg`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-c4.ogg`,
  },
  {
    id: 'e4',
    rootFrequency: 329.63,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-e4.ogg`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-e4.ogg`,
  },
  {
    id: 'g4',
    rootFrequency: 392,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-g4.ogg`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-g4.ogg`,
  },
  {
    id: 'a4',
    rootFrequency: 440,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-a4.ogg`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-a4.ogg`,
  },
  {
    id: 'c5',
    rootFrequency: 523.25,
    arcoUrl: `${SAMPLE_BASE_URL}/arco-c5.ogg`,
    spiccatoUrl: `${SAMPLE_BASE_URL}/spiccato-c5.ogg`,
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
    playbackRate: safeFrequency / anchor.rootFrequency,
    url: anchor.arcoUrl,
  };
}
