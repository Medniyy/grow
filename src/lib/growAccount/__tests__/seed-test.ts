import { assertValidSeed, GROW_ACCOUNT_SEED, MAX_SEED_BYTES } from '../seed';

/**
 * The address of a user's savings is a pure function of this string. The
 * properties below are the ones that, if broken, point every existing user at
 * an empty account while their money stays somewhere nothing will look again.
 *
 * Determinism and per-wallet uniqueness are properties of Solana's
 * `createWithSeed` and were verified against mainnet on 2026-08-30 rather than
 * here — `@solana/web3.js` ships an ESM build jest-expo cannot load.
 */
describe('the Grow account seed', () => {
  it('is versioned, so a future change can be migrated rather than silent', () => {
    expect(GROW_ACCOUNT_SEED).toMatch(/v\d+$/);
  });

  it('fits the limit `createWithSeed` enforces at runtime', () => {
    expect(new TextEncoder().encode(GROW_ACCOUNT_SEED).length).toBeLessThanOrEqual(MAX_SEED_BYTES);
    expect(() => assertValidSeed()).not.toThrow();
  });

  it('rejects a seed that would throw inside Solana instead of here', () => {
    expect(() => assertValidSeed('x'.repeat(MAX_SEED_BYTES + 1))).toThrow(/at most/i);
    expect(() => assertValidSeed('')).toThrow(/empty/i);
  });

  it('counts BYTES, not characters', () => {
    // 10 seedlings: 20 UTF-16 units so a naive `.length` check passes, but 40
    // UTF-8 bytes, which `createWithSeed` rejects on chain.
    const seedlings = '🌱'.repeat(10);
    expect(seedlings.length).toBeLessThanOrEqual(MAX_SEED_BYTES);
    expect(() => assertValidSeed(seedlings)).toThrow(/at most/i);
  });
});
