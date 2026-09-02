/**
 * Yield — when the product offers it, and what it says when it does.
 *
 * The product design is `docs/PRODUCT-LOOP.md` §7.1 and it is settled; do not
 * re-derive it here. The mechanics live in `src/lib/kamino.ts`. This file is
 * only WHEN yield appears and WHAT is said about it, so the copy that carries
 * the risk sits in one auditable place rather than spread across screens.
 */

import { MILESTONES } from './milestones';

/**
 * The rung that hands out supplying — T-shirt, $25.
 *
 * ⚠️ EVERY RUNG BELOW THIS HANDS OUT AN OBJECT: coffee, a meal, a movie. This
 * one hands out a CAPABILITY, and it is the first time the ladder does. That is
 * the whole reason yield is not a nav entry and not a permanently greyed-out
 * button — below $25 nothing about it exists in the UI at all, except the
 * read-only rate note that was already on Profile.
 *
 * $25 rather than the first dollar, because at a first saver's balance the
 * honest annual figure is cents. Supplying $1 to a lending protocol is not a
 * feature, it is a joke with a disclaimer attached.
 */
export const YIELD_MILESTONE_ID = 'tshirt';

/**
 * The threshold in dollars, READ FROM THE LADDER rather than repeated.
 *
 * The two must never drift: the screen that says "at $25" and the milestone
 * that actually unlocks are the same fact, and a hard-coded 25 here would go on
 * being displayed after someone re-tuned the ladder.
 */
export const YIELD_THRESHOLD_USD =
  MILESTONES.find((m) => m.id === YIELD_MILESTONE_ID)?.thresholdUsd ?? 0;

/**
 * Has this wallet earned the capability?
 *
 * Takes the unlocked ids, not the total — Q15, milestones never re-lock, so a
 * balance that later falls below $25 does not take supplying away. The one
 * exception is closing a Grow, which resets the ladder on purpose.
 */
export function yieldUnlocked(unlocked: readonly string[]): boolean {
  return unlocked.includes(YIELD_MILESTONE_ID);
}

/**
 * The extra line on the unlock moment, and the only place the capability is
 * announced.
 *
 * It sits UNDER the object, not instead of it: the T-shirt is still earned and
 * "you kept every cent" is still the point. This is a second, smaller sentence
 * saying the ladder just gave out something that is not a thing to own.
 */
export const YIELD_CAPABILITY_LINE = 'And your Grow can start earning.';

/**
 * The capability line for one Grow's unlocks, or nothing.
 *
 * ⚠️ Takes EVERY id the Grow unlocked, not the headline milestone. The moment
 * animates the highest rung crossed, and a Grow that jumped from $20 to $60
 * headlines Dinner with T-shirt buried in the "and 1 more" count — so keying
 * the capability off the headline would silently swallow the announcement in
 * exactly the case where the user just earned it most decisively.
 */
export function capabilityIn(unlockedNow: readonly string[]): string | undefined {
  return unlockedNow.includes(YIELD_MILESTONE_ID) ? YIELD_CAPABILITY_LINE : undefined;
}

/**
 * Everything the screen has to say about lending, behind "How this works".
 *
 * ⚠️ THIS USED TO STAND ON THE SCREEN, ABOVE THE BUTTON — §7.1's design, on the
 * reasoning that Lulo can be silent about risk only because they bought coverage
 * and Grow has none. The user rejected it on 2026-09-02 having read the built
 * screen: a paragraph parked over the one decision buries the decision, and the
 * pile of text made a simple choice look like a contract.
 *
 * The trade that makes, stated plainly so nobody has to rediscover it: the
 * sentence about shared losses is now one tap away rather than in front of every
 * user. ⚠️ It is therefore the FIRST line here and it is never reordered — a
 * reader who opens this and stops after one line must still have met it.
 *
 * Four lines, and it stays four. Verified against Kamino's own docs 2026-09-02:
 * `products/borrow/supplying.md` and `products/lending-vaults/risks.md`.
 */
export const YIELD_EXPLAINER: readonly string[] = [
  'It is not a bank. Kamino lends your dollars to borrowers, and if one defaults ' +
    'and their collateral does not cover it, lenders share the loss.',
  'The rate is the interest those borrowers pay. It moves with how much of the ' +
    'pool is currently lent out, so it is never a promise.',
  'There is no lock. You take it back whenever you want.',
  'Grow only ever supplies. It never borrows, so there is nothing here that can ' +
    'be liquidated.',
];

/** The source, named once, so "how this works" can be checked rather than trusted. */
export const KAMINO_URL = 'https://kamino.finance';
