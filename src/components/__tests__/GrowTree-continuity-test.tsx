import { render } from '@testing-library/react-native';

import { usdToMicro } from '../../domain/money';
import { GrowTree, progressWithinStage, stageFor } from '../GrowTree';

/**
 * The plant must grow *within* a stage, not only when it crosses one.
 *
 * Before this behaviour existed the geometry was recomputed only at stage
 * boundaries, so every total from $1 to $4.99 drew a byte-identical plant — a
 * product whose entire promise is watching something grow, showing none.
 *
 * ⚠️ Harness limit: in React Native Testing Library v14, calling `view.unmount()`
 * tears down the shared root, and every `render` after it yields a tree whose
 * `toJSON()` is null. So nothing here unmounts — cleanup between tests is left to
 * RNTL. The null guard below exists because a silent null would make these
 * comparisons pass for the wrong reason.
 */
const snapshot = async (usd: number, seed = 'continuityWallet') => {
  const view = await render(<GrowTree grown={usdToMicro(usd)} seed={seed} />);
  const json = view.toJSON();
  expect(json).not.toBeNull(); // guards against the harness limit above
  return JSON.stringify(json);
};

describe('the plant grows continuously', () => {
  it('changes between two totals inside the same stage', async () => {
    expect(stageFor(usdToMicro(1))).toBe(stageFor(usdToMicro(4)));
    expect(await snapshot(1)).not.toBe(await snapshot(4));
  });

  it('changes on a single dollar early on, where it matters most', async () => {
    // $1 -> $2 is the second Grow a user ever makes. If the plant does not move
    // here, the core loop is broken no matter what the number does.
    expect(await snapshot(1)).not.toBe(await snapshot(2));
  });

  it('changes across a late, wide rung', async () => {
    // $100 -> $500 sits in the stretch where the ladder goes quiet and the plant
    // is the only thing still reporting progress.
    expect(await snapshot(100)).not.toBe(await snapshot(500));
  });
});

describe('progressWithinStage', () => {
  it('advances through a rung and resets at the next one', () => {
    expect(progressWithinStage(usdToMicro(1))).toBe(0);
    expect(progressWithinStage(usdToMicro(3))).toBeGreaterThan(progressWithinStage(usdToMicro(2)));
    expect(progressWithinStage(usdToMicro(4.99))).toBeLessThan(1);
    expect(progressWithinStage(usdToMicro(5))).toBe(0);
  });

  it('is monotonic across every rung boundary in the ladder', () => {
    for (const [from, to] of [
      [1, 4.99],
      [5, 24.99],
      [25, 99.99],
      [100, 999.99],
    ] as const) {
      expect(progressWithinStage(usdToMicro(to))).toBeGreaterThan(
        progressWithinStage(usdToMicro(from)),
      );
    }
  });

  it('stays inside 0..1 and finite at both extremes', () => {
    for (const usd of [0, 0.5, 1, 9999, 100000, 10_000_000]) {
      const p = progressWithinStage(usdToMicro(usd));
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});
