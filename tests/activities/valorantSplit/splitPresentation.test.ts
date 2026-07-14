import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const splitSceneSource = readFileSync(
  resolve(__dirname, '../../../src/activities/valorantSplit/SplitScene.ts'),
  'utf8',
);

describe('RETAKE.EXE presentation', () => {
  it('does not render teammate dialogue boxes over active gameplay', () => {
    expect(splitSceneSource).not.toContain('barkText');
    expect(splitSceneSource).not.toContain('showTeammateBark');
    expect(splitSceneSource).not.toContain("backgroundColor: '#20304aee'");
  });
});
