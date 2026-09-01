import {
  canPromiseUnlock,
  holdingValueMicro,
  inputAtomicFor,
  paddedTarget,
  shortfall,
  validateGrowAmount,
} from '../growPlan';
import { usdToMicro } from '../money';

describe('the unlock promise (Q2)', () => {
  const meal = usdToMicro(5);
  const grown = usdToMicro(4.21);

  it('promises only when the guaranteed floor gets there', () => {
    // Expected output would clear it, but the floor is what we promise on.
    const gap = meal - grown; // $0.79
    expect(canPromiseUnlock(grown, gap, meal)).toBe(true);
    expect(canPromiseUnlock(grown, gap - 1, meal)).toBe(false);
  });

  it('reports the near-miss distance, and nothing once it clears', () => {
    expect(shortfall(grown, usdToMicro(0.78), meal)).toBe(usdToMicro(0.01));
    expect(shortfall(grown, usdToMicro(0.79), meal)).toBeNull();
    expect(shortfall(grown, usdToMicro(5), meal)).toBeNull();
  });

  it('pads the target so slippage cannot eat the promise', () => {
    const gap = usdToMicro(0.79);
    const padded = paddedTarget(gap);
    expect(padded).toBeGreaterThan(gap);
    // 200bps on $0.79 is 1.58c — enough to survive the 20bps DFlow typically
    // quotes, with room for the route moving between quote and execution.
    expect(padded).toBe(805_800);
  });

  it('padding overshoots rather than under-delivers, at every rung', () => {
    for (const usd of [1, 2, 5, 10, 25, 50, 100, 1199]) {
      const gap = usdToMicro(usd);
      expect(paddedTarget(gap)).toBeGreaterThan(gap);
    }
  });
});

describe('input sizing', () => {
  it('converts a USD target into atomic units of the input token', () => {
    // $1 of SOL at $200, 9 decimals -> 0.005 SOL
    expect(inputAtomicFor(usdToMicro(1), 200, 9)).toBe(5_000_000n);
    // $1 of BONK at $0.00002, 5 decimals -> 50,000 BONK
    expect(inputAtomicFor(usdToMicro(1), 0.00002, 5)).toBe(5_000_000_000n);
  });

  it('refuses to size an order against a missing price', () => {
    expect(() => inputAtomicFor(usdToMicro(1), 0, 9)).toThrow(/price/);
  });
});

describe('holding value', () => {
  it('is zero for anything Jupiter omitted from the price response', () => {
    expect(holdingValueMicro(1_000_000n, 6, undefined)).toBe(0);
    expect(holdingValueMicro(1_000_000n, 6, NaN)).toBe(0);
  });

  it('values a normal holding', () => {
    expect(holdingValueMicro(2_000_000_000n, 9, 200)).toBe(usdToMicro(400));
  });
});

describe('the spend guard (Q14)', () => {
  it('rejects anything under the minimum, where fees dominate the number shown', () => {
    expect(validateGrowAmount(usdToMicro(0.24))?.kind).toBe('too-small');
    expect(validateGrowAmount(usdToMicro(0.25))).toBeNull();
  });

  it('rejects anything over the demo cap — this is real money on mainnet', () => {
    expect(validateGrowAmount(usdToMicro(25))).toBeNull();
    expect(validateGrowAmount(usdToMicro(25.01))?.kind).toBe('too-large');
    // The fat-finger case the cap exists for.
    expect(validateGrowAmount(usdToMicro(2500))?.kind).toBe('too-large');
  });

  it('rejects junk rather than letting it reach an order', () => {
    expect(validateGrowAmount(0)?.kind).toBe('not-a-number');
    expect(validateGrowAmount(-1)?.kind).toBe('not-a-number');
    expect(validateGrowAmount(NaN)?.kind).toBe('not-a-number');
    expect(validateGrowAmount(Infinity)?.kind).toBe('not-a-number');
  });
});
