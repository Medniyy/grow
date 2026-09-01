/**
 * The Grow Account's seed — the pure, testable half.
 *
 * Split from `index.ts` because everything there needs `@solana/web3.js`, whose
 * ESM build jest-expo cannot load. Same split as `lib/solana/usdcDelta`.
 */

/**
 * ⚠️ NEVER CHANGE THIS STRING WITHOUT A MIGRATION.
 *
 * The Grow Account's address is a pure function of the user's wallet, this
 * seed, and the SPL Token program id. Changing it points every existing user at
 * a different, empty address while their savings stay at the old one, which
 * nothing in the app would ever look at again. A change ships together with
 * code that moves the funds, never on its own — hence the version suffix.
 */
export const GROW_ACCOUNT_SEED = 'grow-usdc-v1';

/** `createWithSeed` rejects anything longer; the failure is a runtime throw. */
export const MAX_SEED_BYTES = 32;

export function assertValidSeed(seed: string = GROW_ACCOUNT_SEED): void {
  const bytes = new TextEncoder().encode(seed).length;
  if (bytes === 0) throw new Error('Grow account seed must not be empty.');
  if (bytes > MAX_SEED_BYTES) {
    throw new Error(`Grow account seed must be at most ${MAX_SEED_BYTES} bytes, got ${bytes}.`);
  }
}
