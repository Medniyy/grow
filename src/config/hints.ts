/**
 * The moment-of-need lines — `docs/PRODUCT-LOOP.md` §2.
 *
 * Editable configuration, like `MILESTONES` and `WALKTHROUGH`. Nothing in the
 * app may hard-code one of these sentences.
 *
 * ⚠️ These are NOT the walkthrough. The walkthrough answers "what is this app"
 * to somebody who has not connected anything; a hint answers the one question
 * the screen in front of them raises, at the first moment it can be asked, and
 * then never again. §2 ruled a tutorial carousel out in favour of exactly this,
 * and that reasoning still holds — the walkthrough exists because moment-of-need
 * copy cannot teach someone who never arrives at the moment. They are
 * complements.
 *
 * Rules, enforced by `__tests__/hints-test.ts`:
 *
 * - **Two sentences at most.** A hint is read in passing or not at all.
 * - **The word "pay" appears nowhere**, for the same reason as the walkthrough:
 *   `pay yourself first` gets read as paying somebody.
 * - **No hint names a milestone.** Which rung is unlocked first depends on the
 *   ladder and on how much the user grew; a sentence naming coffee goes wrong
 *   the day someone's first Grow is $6.
 */

/** Ids for one-time explanations, shown at the first moment they matter. */
export type HintId = 'grow-screen' | 'first-unlock';

export type Hint = {
  readonly id: HintId;
  readonly line: string;
};

export const HINTS: readonly Hint[] = [
  /**
   * ⚠️ `grow-screen` was here — *"You are converting what you already hold.
   * Nothing leaves your wallet."* — and it was CUT on 2026-09-02 after the user
   * read it in the running app: **"это сообщение ещё больше создаёт конфуза"**.
   *
   * PRODUCT-LOOP §2 called it the single most load-bearing sentence in the
   * product, and the reasoning was sound on paper. In front of a real user it
   * was not: standing over two wheels and a button that says `Grow $1.00`, a
   * sentence about what does NOT happen introduces a worry nobody had yet, in
   * vocabulary ("converting") the rest of the screen never uses. The id stays
   * in `HintId` so the flag it wrote survives; nothing shows it.
   *
   * The need it was aimed at is real and moved elsewhere: the dust sweep, which
   * demonstrates "nothing leaves your wallet" by doing it rather than claiming
   * it. See `docs/PRODUCT-LOOP.md`.
   */
  {
    /**
     * The mind-shift the whole product depends on, delivered at the one moment
     * the user is receptive to it: they have just been shown a thing they can
     * afford, and they still have the money.
     */
    id: 'first-unlock',
    line: 'You just proved you could buy it — and kept the money.',
  },
] as const;

export function hintById(id: HintId): Hint | undefined {
  return HINTS.find((hint) => hint.id === id);
}
