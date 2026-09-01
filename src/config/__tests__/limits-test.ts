import {
  GROW_SLIPPAGE_BPS,
  MAX_GROW_USD,
  MIN_DISPLAY_VALUE_USD,
  MIN_GROW_USD,
  UNLOCK_PAD_BPS,
} from '../limits';

/**
 * The limits are not independent numbers. Each pair below has a relationship
 * that the comments in `limits.ts` state and that nothing else enforces — and
 * every one of them broke something real when it drifted.
 */
describe('limits', () => {
  it('never hides a holding the user is allowed to grow', () => {
    // Measured on the demo wallet 2026-09-02: with the floor at $0.50 and the
    // minimum Grow at $0.25, three real holdings — $0.41, $0.29, $0.29 — were
    // offerable and invisible. Dust is the thing this screen exists to clear.
    expect(MIN_DISPLAY_VALUE_USD).toBeLessThanOrEqual(MIN_GROW_USD);
  });

  it('keeps slippage tolerance below the unlock pad', () => {
    // The pad is what lets Grow promise "this unlocks Coffee" from
    // `minOutAmount`. A tolerance wider than the pad lets a Grow land UNDER the
    // milestone it just promised, which breaks a commitment, not a number.
    expect(GROW_SLIPPAGE_BPS).toBeLessThan(UNLOCK_PAD_BPS);
  });

  it('leaves a spend range that is actually a range', () => {
    expect(MIN_GROW_USD).toBeGreaterThan(0);
    expect(MAX_GROW_USD).toBeGreaterThan(MIN_GROW_USD);
  });
});
