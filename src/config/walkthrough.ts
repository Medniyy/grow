/**
 * The walkthrough — the six sentences that answer "what is this app".
 *
 * Editable configuration, like `MILESTONES`. Nothing in the app may hard-code a
 * line of this copy.
 *
 * ⚠️ ONE SENTENCE PER SLIDE, and it is a hard rule rather than a style
 * preference. This deck exists because people were handed the app and could not
 * say what it did; a paragraph is what they were already failing to read on
 * Home. If a slide needs a second sentence, it is two slides or it is cut.
 *
 * The order is the argument, not a feature list:
 *
 *   1-2  the rule    — why anyone should want this at all
 *   3-4  the object  — what Grow is, and the one fact that stops the fear
 *   5-6  the payoff  — what it turns into, and the line the product lives on
 *
 * ⚠️ The word "pay" appears nowhere. The idea is "a part of all you earn is
 * yours to keep" (Clason), and every attempt to say it with `pay yourself first`
 * gets read as paying somebody. `keep` has no counterparty and cannot be
 * misread. Do not reintroduce it.
 */

/** Which drawing a slide shows. Handled exhaustively by `WalkthroughArt`. */
export type WalkthroughArtId = 'outflow' | 'onekept' | 'seed' | 'transfer' | 'ladder' | 'both';

export type WalkthroughSlide = {
  /** Stable id — the join key for artwork and for tests. */
  readonly id: string;
  readonly line: string;
  readonly art: WalkthroughArtId;
};

export const WALKTHROUGH: readonly WalkthroughSlide[] = [
  { id: 'outflow', line: 'Everything you earn goes to someone else.', art: 'outflow' },
  { id: 'yours', line: 'A part of it should stay yours.', art: 'onekept' },
  { id: 'what', line: 'Grow is where that part lives.', art: 'seed' },
  {
    id: 'safe',
    line: 'Nothing is spent — it just moves to an account only you can open.',
    art: 'transfer',
  },
  { id: 'unlocks', line: 'What you keep unlocks real things.', art: 'ladder' },
  { id: 'payoff', line: 'You unlock them, and still have the money.', art: 'both' },
] as const;

/** The three rungs the ladder slide shows: cheap, plausible, aspirational. */
export const WALKTHROUGH_LADDER = ['coffee', 'dinner', 'iphone'] as const;
