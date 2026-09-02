import type { VersionedTransactionResponse } from '@solana/web3.js';

import { USDC } from '../../../config/tokens';
import { usdcDeltaInto } from '../usdcDelta';

type Meta = VersionedTransactionResponse['meta'];

const OWNER = 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp';
const OTHER = 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS';

/** The transaction's resolved account list — token balances index into this. */
const GROW = 'Gr0wAcc0untAddre55111111111111111111111111';
const SPENDING = 'Sp3ndingAtaAddre55111111111111111111111111';
const STRANGER = 'Str4ngerAccountAddre5511111111111111111111';
const KEYS = [GROW, SPENDING, STRANGER];

const balance = (owner: string, mint: string, amount: string, index = 0) => ({
  accountIndex: index,
  mint,
  owner,
  programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6, uiAmountString: amount },
});

const meta = (pre: unknown[], post: unknown[]): Meta =>
  ({ preTokenBalances: pre, postTokenBalances: post } as unknown as Meta);

describe('usdcDeltaInto (Q5)', () => {
  it('reads the real delta, not the quote', () => {
    const m = meta([balance(OWNER, USDC.mint, '1000000')], [balance(OWNER, USDC.mint, '1990000')]);
    expect(usdcDeltaInto(m, KEYS, GROW)).toBe(990_000);
  });

  it('handles a first-ever Grow, where no pre-balance entry exists at all', () => {
    // The token account is created by this very transaction. A missing `pre`
    // must read as zero — treating it as "skip" would lose the first dollar,
    // which is the single most important dollar in the product.
    const m = meta([], [balance(OWNER, USDC.mint, '1000000')]);
    expect(usdcDeltaInto(m, KEYS, GROW)).toBe(1_000_000);
  });

  it('does not count the same owner’s spending account as savings', () => {
    // ⚠️ THE REGRESSION THIS FUNCTION EXISTS FOR. The Grow Account and the
    // ordinary ATA have the SAME OWNER, so an owner-wide sum reported the same
    // number whether the dollars were saved or handed straight back to the
    // spending balance — and DFlow silently dropping `destinationTokenAccount`
    // would have been recorded as a perfectly successful Grow.
    const m = meta([], [balance(OWNER, USDC.mint, '5000000', 1)]);
    expect(usdcDeltaInto(m, KEYS, GROW)).toBe(0);
    expect(usdcDeltaInto(m, KEYS, SPENDING)).toBe(5_000_000);
  });

  it('ignores other people in the same transaction', () => {
    const m = meta(
      [balance(OTHER, USDC.mint, '0', 2)],
      [balance(OWNER, USDC.mint, '500000', 0), balance(OTHER, USDC.mint, '9000000', 2)],
    );
    expect(usdcDeltaInto(m, KEYS, GROW)).toBe(500_000);
  });

  it('ignores other mints', () => {
    const m = meta([], [balance(OWNER, 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', '999')]);
    expect(usdcDeltaInto(m, KEYS, GROW)).toBe(0);
  });

  it('never reports a negative amount, and survives missing meta', () => {
    const m = meta([balance(OWNER, USDC.mint, '5000000')], [balance(OWNER, USDC.mint, '1000000')]);
    expect(usdcDeltaInto(m, KEYS, GROW)).toBe(0);
    expect(usdcDeltaInto(null, KEYS, GROW)).toBe(0);
  });

  it('reads zero for an account the transaction never touched', () => {
    // Which is what the caller turns into a failure: a confirmed swap that put
    // nothing in the Grow Account is a read that failed or money that went
    // elsewhere, and never a Grow worth $0.
    const m = meta([], [balance(OWNER, USDC.mint, '1000000', 1)]);
    expect(usdcDeltaInto(m, KEYS, STRANGER)).toBe(0);
  });
});
