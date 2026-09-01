/**
 * Mints and decimals. All verified live; all classic SPL (none are Token-2022).
 *
 * WSOL is `So1111…112` (ends 2). `So1111…111` (ends 1) is the *native SOL
 * reference* and is not a mint — passing it to DFlow is a silent wrong answer.
 */
export type TokenMeta = {
  readonly mint: string;
  readonly symbol: string;
  readonly decimals: number;
};

export const USDC: TokenMeta = {
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
};

export const WSOL: TokenMeta = {
  mint: 'So11111111111111111111111111111111111111112',
  symbol: 'SOL',
  decimals: 9,
};

export const KNOWN_TOKENS: readonly TokenMeta[] = [
  USDC,
  WSOL,
  { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', decimals: 5 },
  { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', decimals: 6 },
];

/**
 * Dollars. What the Grow screen offers first, and the only sources with no
 * market move to think about at the moment of keeping.
 *
 * ⚠️ Membership is a claim about the peg, not about liquidity, so nothing goes
 * in here that has not been seen on chain in this wallet's own history. USDT is
 * `Es9vMF…`, verified in the DFlow routes of 2026-08-31.
 */
export const STABLE_MINTS: ReadonlySet<string> = new Set([
  USDC.mint,
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
]);

/** Native SOL is held as lamports, not in a token account, but swaps as WSOL. */
export const NATIVE_SOL_REFERENCE = 'So11111111111111111111111111111111111111111';

export function tokenFor(mint: string): TokenMeta | undefined {
  return KNOWN_TOKENS.find((t) => t.mint === mint);
}
