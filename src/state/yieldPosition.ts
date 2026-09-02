import { DEMO_YIELD_POSITION } from '../config/demo';
import { env } from '../config/env';
import { yieldUnlocked } from '../config/yield';
import type { MicroUsd } from '../domain/money';
import { useGrow } from './growStore';

/**
 * A live supply position — the body, and the extra.
 *
 * ⚠️ TWO FIGURES, NEVER ONE. §7.1 decision 3: the body is what the user put in
 * and the earnings are a separate, deliberately beautiful number. Summing them
 * into a single balance is the thing that makes yield indistinguishable from a
 * bank statement, and it is also what would make the ladder unverifiable — the
 * ladder measures what the user DECIDED to keep, and interest arrived on its own
 * (§7.1 decision 2).
 */
export type YieldPosition = {
  readonly supplied: MicroUsd;
  readonly earned: MicroUsd;
};

/**
 * What is currently supplied to Kamino, or null for nothing.
 *
 * ⚠️ NULL IS THE ONLY REAL ANSWER TODAY, and that is correct rather than
 * unfinished: nothing in this build supplies anything, so nobody can have a
 * position. The chain read lands with the deposit — the same shape as
 * `growAccount.kept`, which is read from the chain rather than remembered, so a
 * cleared browser cannot lose track of money.
 *
 * Demo Mode is the exception, and only so the design can be looked at before
 * real capital is committed to it. It is subject to the same hard rule as the
 * seeded ledger: the screen carrying it already says DEMO DATA out loud.
 */
export function useYieldPosition(): YieldPosition | null {
  const grow = useGrow();

  // The capability gates the position as well as the door to it. Without this a
  // seeded demo would light up a strip for a wallet that never earned the rung.
  if (!yieldUnlocked(grow.unlocked)) return null;

  return env.demoMode ? DEMO_YIELD_POSITION : null;
}
