import { MAX_GROW_USD, MIN_GROW_USD, SOL_FEE_RESERVE_USD } from '../../config/limits';
import { USDC, WSOL } from '../../config/tokens';
import {
  availableMicro,
  defaultAsset,
  defaultRungIndex,
  growable,
  isFalling,
  isRising,
  rungsFor,
} from '../growLadder';
import { formatUsd, usdToMicro } from '../money';

const asset = (mint: string, usd: number) => ({ mint, valueMicro: usdToMicro(usd) });

/** What the wheel actually reads, so the assertions match the screen. */
const labels = (usd: number, seeded: number | null = null) =>
  rungsFor(availableMicro(asset('MORI', usd)), seeded === null ? null : usdToMicro(seeded)).map(
    (rung) => formatUsd(rung.micro) + (rung.all ? ' ALL' : ''),
  );

describe('rungsFor', () => {
  it('stops at the balance and marks the last rung ALL', () => {
    // The screen this replaces offered $1 out of a holding worth $0.56.
    expect(labels(0.56)).toEqual(['$0.25', '$0.50', '$0.56 ALL']);
  });

  it('offers round amounts under the balance', () => {
    expect(labels(3.7)).toEqual(['$0.25', '$0.50', '$1', '$2', '$3.70 ALL']);
  });

  it('never claims ALL when the demo ceiling is what stopped it', () => {
    const rungs = rungsFor(availableMicro(asset('UNICORN', 225.9)));
    const last = rungs[rungs.length - 1];
    expect(last.micro).toBe(usdToMicro(MAX_GROW_USD));
    expect(last.all).toBe(false);
  });

  it('offers nothing for a balance under the floor', () => {
    expect(rungsFor(availableMicro(asset('DUST', MIN_GROW_USD / 2)))).toEqual([]);
  });

  it('keeps the ALL rung strictly inside the balance', () => {
    // The one rung with nothing in reserve: rounding UP by a single atomic unit
    // is the difference between a Grow and an insufficient-funds failure.
    for (const usd of [0.56, 1, 3.7, 12.3456, 24.99]) {
      const rungs = rungsFor(availableMicro(asset('T', usd)));
      const last = rungs[rungs.length - 1];
      expect(last.all).toBe(true);
      expect(last.micro).toBeLessThan(usdToMicro(usd));
    }
  });

  it('leaves SOL enough to pay for the transaction that spends it', () => {
    const sol = asset(WSOL.mint, 4);
    expect(availableMicro(sol)).toBe(usdToMicro(4 - SOL_FEE_RESERVE_USD));
    const last = rungsFor(availableMicro(sol)).at(-1);
    expect(last?.micro).toBeLessThan(usdToMicro(4 - SOL_FEE_RESERVE_USD));
  });

  it('carries the amount Home already decided on', () => {
    // A padded milestone target is not a round number and must survive anyway.
    expect(labels(3.7, 1.02)).toEqual(['$0.25', '$0.50', '$1', '$1.02', '$2', '$3.70 ALL']);
  });
});

describe('defaultRungIndex', () => {
  const pick = (usd: number, seeded: number | null = null) => {
    const seededMicro = seeded === null ? null : usdToMicro(seeded);
    const rungs = rungsFor(availableMicro(asset('T', usd)), seededMicro);
    return formatUsd(rungs[defaultRungIndex(rungs, seededMicro)].micro);
  };

  it('spends a whole balance too small to be worth splitting', () => {
    expect(pick(0.56)).toBe('$0.56');
  });

  it('defaults to a dollar out of anything that can cover one', () => {
    expect(pick(3.7)).toBe('$1');
    expect(pick(225.9)).toBe('$1');
  });

  it('selects the seeded amount over the default', () => {
    expect(pick(3.7, 1.02)).toBe('$1.02');
  });
});

describe('growable', () => {
  const assets = [
    asset('UNICORN', 225.9),
    asset(WSOL.mint, 32.29),
    asset('USDT', 3.7),
    asset('MORI', 0.56),
    asset('DUST', 0.1),
  ];

  it('drops what cannot fund a Grow and offers dollars, then SOL, then the rest', () => {
    // ⚠️ NOT smallest first any more. The user used that order and rejected it:
    // the wheel opened on a meme coin and read as a bin of leftovers rather
    // than the place you keep money.
    expect(growable([...assets, asset(USDC.mint, 674)]).map((a) => a.mint)).toEqual([
      USDC.mint,
      WSOL.mint,
      'UNICORN',
      'USDT',
      'MORI',
    ]);
  });

  it('leaves a stablecoin crumb ranked as the dust it is', () => {
    // Pegged to a dollar is not the same as being worth keeping first.
    const crumb = [asset(USDC.mint, 0.3), asset('UNICORN', 225.9)];
    expect(growable(crumb).map((a) => a.mint)).toEqual(['UNICORN', USDC.mint]);
  });

  it('opens on dollars when there are any', () => {
    expect(defaultAsset([...assets, asset(USDC.mint, 674)])?.mint).toBe(USDC.mint);
  });

  it('opens on the first thing that can fund a normal Grow when there are none', () => {
    // NOT `MORI` at $0.56, which is what greeted a real wallet with $0.29 of a
    // meme coin only that wallet holds.
    expect(defaultAsset(assets)?.mint).toBe(WSOL.mint);
  });

  it('falls back to the largest when nothing can fund a normal Grow', () => {
    const crumbs = [asset('NYAN', 0.41), asset('BARK', 0.29), asset('DUST', 0.1)];
    expect(defaultAsset(crumbs)?.mint).toBe('NYAN');
  });

  it('has no default when nothing is growable', () => {
    expect(defaultAsset([asset('DUST', 0.1)])).toBeNull();
  });
});

describe('isFalling / isRising', () => {
  it('are symmetric around the same threshold', () => {
    expect(isFalling(-3)).toBe(true);
    expect(isRising(3)).toBe(true);
    expect(isFalling(-2.9)).toBe(false);
    expect(isRising(2.9)).toBe(false);
  });

  it('speaks about a 3% day, which is a real day', () => {
    // At 10% the screen was silent about an asset down 3% and the silence read
    // as a missing feature, not as restraint.
    expect(isFalling(-3.9)).toBe(true);
  });

  it('stays quiet about noise', () => {
    expect(isFalling(-0.0138)).toBe(false);
    expect(isRising(1)).toBe(false);
    expect(isFalling(Number.NaN)).toBe(false);
  });
});
