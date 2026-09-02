import { MILESTONES } from '../milestones';
import {
  YIELD_CAPABILITY_LINE,
  YIELD_MILESTONE_ID,
  YIELD_THRESHOLD_USD,
  capabilityIn,
  yieldUnlocked,
} from '../yield';

/**
 * Yield hangs off one milestone id, and that id is a string join into a config
 * file somebody will edit. Every case below is a way the capability silently
 * stops existing while the app still compiles.
 */
describe('yield capability', () => {
  it('names a milestone that is actually on the ladder', () => {
    // A renamed or removed rung would leave `yieldUnlocked` permanently false —
    // no error, no missing screen, just a capability nobody can ever earn.
    expect(MILESTONES.some((m) => m.id === YIELD_MILESTONE_ID)).toBe(true);
  });

  it('reads its threshold from the ladder rather than repeating it', () => {
    const rung = MILESTONES.find((m) => m.id === YIELD_MILESTONE_ID);
    expect(YIELD_THRESHOLD_USD).toBe(rung?.thresholdUsd);
    // Cheap dollars would make the disclaimer's arithmetic dishonest: the whole
    // reason this waits is that a first saver's annual yield is cents.
    expect(YIELD_THRESHOLD_USD).toBeGreaterThanOrEqual(25);
  });

  it('is locked until the rung is earned', () => {
    expect(yieldUnlocked([])).toBe(false);
    expect(yieldUnlocked(['started', 'coffee', 'meal'])).toBe(false);
    expect(yieldUnlocked(['started', YIELD_MILESTONE_ID])).toBe(true);
  });

  it('announces the capability even when a bigger rung takes the headline', () => {
    // ⚠️ The regression this exists for. A Grow from $20 to $60 crosses T-shirt
    // AND Dinner; the moment animates Dinner and reports "and 1 more". Keyed off
    // the headline, the one sentence that tells the user they can now earn would
    // never be shown to the person who earned it hardest.
    expect(capabilityIn([YIELD_MILESTONE_ID, 'dinner'])).toBe(YIELD_CAPABILITY_LINE);
    expect(capabilityIn(['dinner'])).toBeUndefined();
    expect(capabilityIn([])).toBeUndefined();
  });
});
