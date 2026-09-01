/**
 * The tour — six scenes of the real product, moving.
 *
 * Editable configuration, like `WALKTHROUGH`. Nothing in the app may hard-code
 * a line of this copy.
 *
 * ⚠️ IT ANSWERS A DIFFERENT QUESTION FROM THE WALKTHROUGH. That deck is *why*
 * — six sentences for somebody who cannot yet say what this app is. This one is
 * *how*: what you touch, and what happens when you do. Neither replaces the
 * other, and a scene here that argues the case again is a scene that belongs in
 * the walkthrough or nowhere.
 *
 * The rules, enforced by `__tests__/tour-test.ts`:
 *
 * - **One sentence per scene.** Same hard rule as the walkthrough, and for the
 *   same reason: this exists because people did not read what was already there.
 * - **The word "pay" appears nowhere.**
 * - **Scene 6 is not optional.** The way out is what makes the other five
 *   believable to somebody who has just been asked to move money into an
 *   account they had never heard of twenty seconds earlier. A test pins it.
 *
 * And one rule the tests cannot reach, so it is written here: **every scene is
 * drawn with the REAL components** — `Wheel`, `CountUp`, `GrowTree`,
 * `ProgressBar`, `MilestoneMark` — fed fake data. Never screenshots, never
 * bespoke mockups. A tour that can go stale is worse than no tour.
 */

/** Which scene a line is played over. Handled exhaustively by `TourScene`. */
export type TourSceneId = 'pick' | 'move' | 'plant' | 'unlock' | 'payoff' | 'out';

export type TourStep = {
  /** Stable id — the join key for the scene and for tests. */
  readonly id: TourSceneId;
  readonly line: string;
};

export const TOUR: readonly TourStep[] = [
  { id: 'pick', line: 'Pick how much to keep.' },
  { id: 'move', line: 'It moves to your Grow.' },
  { id: 'plant', line: 'Your plant grows with it.' },
  { id: 'unlock', line: 'Every few dollars unlocks something real.' },
  { id: 'payoff', line: 'You could buy it — you keep the money instead.' },
  { id: 'out', line: 'Take it all back whenever you want.' },
] as const;

/**
 * How long a scene holds before the next one arrives.
 *
 * Long enough to watch one thing happen, short enough that the whole tour is
 * over before anyone decides to leave — six scenes lands just under twenty
 * seconds. A tap skips ahead at any point.
 */
export const TOUR_SCENE_MS = 3200;

/** The milestone the tour unlocks. The cheapest rung — see `MILESTONES`. */
export const TOUR_MILESTONE_ID = 'coffee';
