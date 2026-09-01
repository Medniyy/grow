import { usdToMicro } from '../money';
import {
  computeProgress,
  crossedPercentMarks,
  goalProgress,
  highestOf,
  ladder,
  milestoneById,
  newUnlockIds,
  unlockedIds,
} from '../progress';

describe('the ladder', () => {
  it('is ascending and starts with the free seed', () => {
    const rungs = ladder();
    expect(rungs[0].id).toBe('started');
    expect(rungs[0].thresholdUsd).toBe(0);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].thresholdUsd).toBeGreaterThan(rungs[i - 1].thresholdUsd);
    }
  });
});

describe('progress', () => {
  it('gives a brand-new user Started and points at Coffee', () => {
    const p = computeProgress(0);
    expect(p.unlockedIds).toEqual(['started']);
    expect(p.current?.id).toBe('started');
    expect(p.next?.id).toBe('coffee');
    expect(p.remaining).toBe(usdToMicro(1));
  });

  it('reproduces the figures in SPEC §10', () => {
    const p = computeProgress(usdToMicro(4.21));
    expect(p.next?.id).toBe('meal');
    expect(p.next?.thresholdUsd).toBe(5);
    expect(p.remaining).toBe(usdToMicro(0.79));
    expect(p.percentToNext).toBeCloseTo(0.842, 3);
  });

  it('shows exactly one next unlock, and none at the top of the ladder', () => {
    expect(computeProgress(usdToMicro(1)).next?.id).toBe('cola');
    const finished = computeProgress(usdToMicro(999_999));
    expect(finished.next).toBeNull();
    expect(finished.remaining).toBe(0);
    expect(finished.percentToNext).toBe(1);
  });

  it('unlocks exactly on the threshold, not a cent above it', () => {
    expect(computeProgress(usdToMicro(0.999999)).unlockedIds).not.toContain('coffee');
    expect(computeProgress(usdToMicro(1)).unlockedIds).toContain('coffee');
  });
});

describe('multi-unlock', () => {
  it('crosses several rungs in one Grow and animates only the highest', () => {
    const earned = newUnlockIds(usdToMicro(60), ['started']);
    expect(earned).toEqual(['coffee', 'cola', 'meal', 'movie', 'tshirt', 'dinner']);
    expect(highestOf(earned)?.id).toBe('dinner');
  });

  it('returns nothing when there is nothing new (idempotent on retry — Q4)', () => {
    const persisted = unlockedIds(usdToMicro(60));
    expect(newUnlockIds(usdToMicro(60), persisted)).toEqual([]);
    // Deriving from the resulting total rather than a delta is what makes a
    // replayed confirmation a no-op instead of a second celebration.
    expect(newUnlockIds(usdToMicro(60), persisted)).toEqual([]);
  });
});

describe('milestones never re-lock (Q15)', () => {
  it('keeps unlocks even if the total somehow reads lower', () => {
    const persisted = unlockedIds(usdToMicro(100));
    expect(unlockedIds(0, persisted)).toEqual(expect.arrayContaining(['headphones', 'meal']));
  });

  it('keeps an unlock whose milestone was removed from the ladder', () => {
    const persisted = ['started', 'coffee', 'retired-milestone'];
    const earned = unlockedIds(usdToMicro(1), persisted);
    expect(earned).toContain('retired-milestone');
  });

  it('joins on stable id, so re-pricing a milestone cannot take it away', () => {
    // 'coffee' earned at $1; if its threshold were later raised to $3 the id is
    // still in the persisted set and survives.
    const persisted = ['started', 'coffee'];
    expect(unlockedIds(usdToMicro(2), persisted)).toContain('coffee');
  });
});

describe('percent moments inside a rung', () => {
  const meal = milestoneById('meal')!; // $5

  it('fires only on the move that crossed the mark', () => {
    // $1.00 -> $2.60 crosses 25% and 50% of $5.
    expect(crossedPercentMarks(usdToMicro(1), usdToMicro(2.6), meal)).toEqual([25, 50]);
    // Repeating the same totals reports nothing — idempotent like unlocks (Q4).
    expect(crossedPercentMarks(usdToMicro(2.6), usdToMicro(2.6), meal)).toEqual([]);
  });

  it('leaves the unlock itself to own the 100% moment', () => {
    expect(crossedPercentMarks(usdToMicro(4), usdToMicro(5), meal)).toEqual([]);
    // $4 is already 80% of $5, so only 90% is still ahead.
    expect(crossedPercentMarks(usdToMicro(4), usdToMicro(4.6), meal)).toEqual([90]);
    expect(crossedPercentMarks(usdToMicro(3.5), usdToMicro(4.6), meal)).toEqual([75, 90]);
  });

  it('is silent with no target, and on the free rung', () => {
    expect(crossedPercentMarks(0, usdToMicro(100), null)).toEqual([]);
    expect(crossedPercentMarks(0, usdToMicro(100), milestoneById('started')!)).toEqual([]);
  });

  it('carries the long climb it exists for', () => {
    // $500 -> $1,199 is the stretch where the ladder goes quiet.
    const iphone = milestoneById('iphone')!;
    expect(crossedPercentMarks(usdToMicro(500), usdToMicro(600), iphone)).toEqual([50]);
    expect(crossedPercentMarks(usdToMicro(600), usdToMicro(1100), iphone)).toEqual([75, 90]);
  });
});

describe('goalProgress', () => {
  it('reports the horizon the user chose, not the rung arriving next', () => {
    // Picking iPhone while T-shirt is next has to change something on screen,
    // or the question was a survey rather than a commitment.
    const found = goalProgress(usdToMicro(10.07), 'iphone');

    expect(found?.milestone.label).toBe('iPhone');
    expect(found?.remaining).toBe(usdToMicro(1188.93));
    expect(found?.reached).toBe(false);
  });

  it('knows when the goal has been reached', () => {
    const found = goalProgress(usdToMicro(1199), 'iphone');
    expect(found?.reached).toBe(true);
    expect(found?.remaining).toBe(0);
    expect(found?.percent).toBe(1);
  });

  it('never invents a goal nobody chose', () => {
    expect(goalProgress(usdToMicro(10), null)).toBeNull();
    expect(goalProgress(usdToMicro(10), 'no-such-milestone')).toBeNull();
    // `started` is the free seed at $0 and cannot be aimed at.
    expect(goalProgress(usdToMicro(10), 'started')).toBeNull();
  });
});
