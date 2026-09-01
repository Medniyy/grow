import type { VersionedTransactionResponse } from '@solana/web3.js';

import { USDC } from '../../config/tokens';
import type { MicroUsd } from '../../domain/money';

/**
 * Q5 — the ledger figure comes from the CONFIRMED TRANSACTION, never the quote.
 *
 * Quoted values drift from chain permanently and break Rule 2 invisibly. This
 * reads the actual USDC delta for the owner out of `pre/postTokenBalances`.
 *
 * Pure and exported so it can be tested without a network.
 */
export function usdcDeltaFrom(
  meta: VersionedTransactionResponse['meta'],
  owner: string,
  mint: string = USDC.mint,
): MicroUsd {
  if (!meta) return 0;

  const sum = (entries: typeof meta.preTokenBalances) =>
    (entries ?? [])
      .filter((b) => b.mint === mint && b.owner === owner)
      .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);

  // An account created by this very transaction has no `pre` entry at all,
  // which is the common case for a first-ever Grow — it must read as zero,
  // not as "missing, skip this transaction".
  const delta = sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
  return delta > 0n ? Number(delta) : 0;
}
