import type { VersionedTransactionResponse } from '@solana/web3.js';

import { USDC } from '../../../config/tokens';
import { usdcDeltaFrom } from '../usdcDelta';

type Meta = VersionedTransactionResponse['meta'];

const OWNER = 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp';
const OTHER = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS';

const balance = (owner: string, mint: string, amount: string, index = 0) => ({
  accountIndex: index,
  mint,
  owner,
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6, uiAmountString: amount },
});

const meta = (pre: unknown[], post: unknown[]): Meta =>
  ({ preTokenBalances: pre, postTokenBalances: post } as unknown as Meta);

describe('usdcDeltaFrom (Q5)', () => {
  it('reads the real delta, not the quote', () => {
    const m = meta(
      [balance(OWNER, USDC.mint, '1000000')],
      [balance(OWNER, USDC.mint, '1990000')],
    );
    expect(usdcDeltaFrom(m, OWNER)).toBe(990_000);
  });

  it('handles a first-ever Grow, where no pre-balance entry exists at all', () => {
    // The token account is created by this very transaction. A missing `pre`
    // must read as zero — treating it as "skip" would lose the first dollar,
    // which is the single most important dollar in the product.
    const m = meta([], [balance(OWNER, USDC.mint, '1000000')]);
    expect(usdcDeltaFrom(m, OWNER)).toBe(1_000_000);
  });

  it('ignores other owners in the same transaction', () => {
    const m = meta(
      [balance(OTHER, USDC.mint, '0', 1)],
      [balance(OWNER, USDC.mint, '500000'), balance(OTHER, USDC.mint, '9000000', 1)],
    );
    expect(usdcDeltaFrom(m, OWNER)).toBe(500_000);
  });

  it('ignores other mints', () => {
    const m = meta([], [balance(OWNER, 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', '999')]);
    expect(usdcDeltaFrom(m, OWNER)).toBe(0);
  });

  it('sums across multiple token accounts for the same owner and mint', () => {
    const m = meta(
      [],
      [balance(OWNER, USDC.mint, '400000', 0), balance(OWNER, USDC.mint, '600000', 2)],
    );
    expect(usdcDeltaFrom(m, OWNER)).toBe(1_000_000);
  });

  it('never reports a negative amount, and survives missing meta', () => {
    const m = meta([balance(OWNER, USDC.mint, '5000000')], [balance(OWNER, USDC.mint, '1000000')]);
    expect(usdcDeltaFrom(m, OWNER)).toBe(0);
    expect(usdcDeltaFrom(null, OWNER)).toBe(0);
  });
});
