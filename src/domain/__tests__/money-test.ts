import { addBps, formatUsd, fromAtomic, toAtomic, usdToMicro, microToUsd } from '../money';

describe('toAtomic', () => {
  it('does not inherit float error from ui * 10 ** decimals', () => {
    // The naive form gives 1100000.0000000001 and 0.30000000000000004 * 1e6.
    expect(toAtomic(1.1, 6)).toBe(1_100_000n);
    expect(toAtomic(0.1 + 0.2, 6)).toBe(300_000n);
    expect(toAtomic(4.21, 6)).toBe(4_210_000n);
  });

  it('handles each token decimal we ship with', () => {
    expect(toAtomic(1, 6)).toBe(1_000_000n); // USDC, JUP
    expect(toAtomic(1, 9)).toBe(1_000_000_000n); // WSOL
    expect(toAtomic(1, 5)).toBe(100_000n); // BONK
  });

  it('rejects amounts that would silently corrupt an order', () => {
    expect(() => toAtomic(-1, 6)).toThrow(/negative/);
    expect(() => toAtomic(NaN, 6)).toThrow(/finite/);
    expect(() => toAtomic(1, 99)).toThrow(/decimals/);
  });

  it('round-trips through fromAtomic', () => {
    expect(fromAtomic(toAtomic(12.34, 6), 6)).toBeCloseTo(12.34, 9);
  });
});

describe('micro-USD', () => {
  it('is an integer, so repeated addition cannot drift', () => {
    let total = 0;
    for (let i = 0; i < 100; i++) total += usdToMicro(0.1);
    expect(total).toBe(10_000_000);
    expect(microToUsd(total)).toBe(10);
    // The float equivalent does not hold:
    let floatTotal = 0;
    for (let i = 0; i < 100; i++) floatTotal += 0.1;
    expect(floatTotal).not.toBe(10);
  });
});

describe('formatUsd', () => {
  it('matches the figures in the spec', () => {
    expect(formatUsd(usdToMicro(847))).toBe('$847');
    expect(formatUsd(usdToMicro(4.21))).toBe('$4.21');
    expect(formatUsd(usdToMicro(0.79))).toBe('$0.79');
    expect(formatUsd(usdToMicro(5))).toBe('$5');
    expect(formatUsd(usdToMicro(1199))).toBe('$1,199');
    expect(formatUsd(0)).toBe('$0');
  });

  it('never shows sub-cent precision it is carrying', () => {
    expect(formatUsd(1_004_999)).toBe('$1.00');
  });
});

describe('addBps', () => {
  it('rounds up, so a pad never under-pads the gap it exists to clear', () => {
    expect(addBps(1_000_000, 200)).toBe(1_020_000);
    expect(addBps(1, 200)).toBe(2);
    expect(addBps(0, 200)).toBe(0);
  });
});
