// Mode/setting flags for "The piece on the stand".
//
// Deliberately framework-free (no Phaser, no DOM) so it can be shared by both
// the DOM mode cluster (the activity header) and the Phaser scene WITHOUT pulling
// Phaser into the activity's static module graph — importing a runtime value from
// ViolinScene.ts would drag Phaser in at eval time and break jsdom unit tests.
//
// The object is mutated IN PLACE by the header buttons and read every frame by
// the scene, which reacts to changes (enter/exit practice, swap the view).

export interface ViolinModes {
  /** Render the pitch-over-time "sound graph" instead of the notation staff.
   * Gameplay is otherwise identical (same song, timing, scoring, keys). */
  advanced: boolean;
  /** Free-play sandbox on the graph view: no song, no scoring, no failing, no
   * progression. Any mapped key sounds and draws onto the graph. */
  practice: boolean;
  /** One forgiven wrong press per note (see violinModel). Works in normal and
   * advanced play; irrelevant in practice. */
  mistakesAllowed: boolean;
  /** Highlight the next expected keyboard cap during echo. Off by default;
   * physically pressed caps still illuminate regardless of this setting. */
  keyGuidance: boolean;
}

export function createViolinModes(): ViolinModes {
  return { advanced: false, practice: false, mistakesAllowed: false, keyGuidance: false };
}
