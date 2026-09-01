import { render } from '@testing-library/react-native';

import { usdToMicro } from '../../domain/money';
import {
  GROW_TREE_MAX_ASPECT,
  GrowTree,
  progressWithinStage,
  stageFor,
} from '../GrowTree';

describe('stageFor', () => {
  it('moves the plant through every stage of the ladder', () => {
    expect(stageFor(0)).toBe(0); // seed
    expect(stageFor(usdToMicro(0.99))).toBe(0);
    expect(stageFor(usdToMicro(1))).toBe(1); // sprout
    expect(stageFor(usdToMicro(5))).toBe(2);
    expect(stageFor(usdToMicro(25))).toBe(3);
    expect(stageFor(usdToMicro(100))).toBe(4);
    expect(stageFor(usdToMicro(1000))).toBe(5);
    expect(stageFor(usdToMicro(999_999))).toBe(5);
  });

  it('never goes backwards as the total rises', () => {
    let previous = -1;
    for (const usd of [0, 0.5, 1, 3, 5, 20, 25, 60, 100, 700, 1000, 5000]) {
      const stage = stageFor(usdToMicro(usd));
      expect(stage).toBeGreaterThanOrEqual(previous);
      previous = stage;
    }

    // A plant still advances between stage boundaries.
    expect(progressWithinStage(usdToMicro(1))).toBe(0);
    expect(progressWithinStage(usdToMicro(4))).toBeGreaterThan(0);
    expect(progressWithinStage(usdToMicro(4))).toBeLessThan(1);
  });
});

/**
 * ⚠️ DELIBERATELY ABOVE `GrowTree renders`. That suite calls `unmount()`, and in
 * RNTL v14 an unmount poisons every render that follows it in the same file —
 * `toJSON()` starts returning null and the failure looks like a broken
 * component rather than a broken harness.
 */
describe('the drawn box', () => {
  const SIZE = 120;

  /** Height of the outer container, which is what a caller must reserve. */
  const boxHeight = async (usd: number): Promise<number> => {
    const view = await render(<GrowTree grown={usdToMicro(usd)} seed="wallet" size={SIZE} />);
    const root = view.toJSON() as unknown as { props: { style: { height?: number }[] } };
    const merged = Object.assign({}, ...root.props.style) as { height?: number };
    if (merged.height === undefined) throw new Error('the box no longer carries a height');
    return merged.height;
  };

  it('grows taller as the plant does', async () => {
    // This is the behaviour that made Home walk downward: it is correct, and
    // callers have to reserve for it rather than be surprised by it.
    expect(await boxHeight(1000)).toBeGreaterThan(await boxHeight(0));
  });

  it('never exceeds the aspect it publishes', async () => {
    // ⚠️ Home sizes the plant as `available height / GROW_TREE_MAX_ASPECT` and
    // anchors it at the root, so the soil line never moves. If the box can ever
    // be taller than this, that reservation is wrong and the page walks again.
    for (const usd of [0, 0.5, 1, 5, 25, 100, 1000, 10_000, 1_000_000]) {
      expect(await boxHeight(usd)).toBeLessThanOrEqual(SIZE * GROW_TREE_MAX_ASPECT);
    }
  });

  it('never drops below the floor that keeps a seed from being a sliver', async () => {
    expect(await boxHeight(0)).toBeGreaterThan(SIZE * 0.3);
  });
});

describe('GrowTree renders', () => {
  // Catches the class of failure a bundle check cannot: an SVG primitive that
  // imports but throws, or geometry that produces NaN in a path.
  it.each([0, 1, 5, 25, 100, 1000])('at $%s without throwing', async (usd) => {
    const view = await render(<GrowTree grown={usdToMicro(usd)} seed="TestWalletPubkey1111" />);
    const tree = view.toJSON();
    expect(tree).toBeTruthy();
    // A NaN anywhere in a path silently collapses the plant to nothing.
    expect(JSON.stringify(tree)).not.toContain('NaN');
  });

  it('is deterministic for a given wallet, and differs between wallets', async () => {
    // Each render is read through its own handle; the global `screen` refers to
    // the most recent mount only, which makes three-way comparison unreliable.
    const snapshot = async (seed: string) => {
      const view = await render(<GrowTree grown={usdToMicro(25)} seed={seed} />);
      const json = JSON.stringify(view.toJSON());
      view.unmount();
      return json;
    };

    const a1 = await snapshot('walletA');
    const a2 = await snapshot('walletA');
    const b = await snapshot('walletB');

    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });

});
