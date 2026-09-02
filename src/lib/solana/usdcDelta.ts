import type { VersionedTransactionResponse } from '@solana/web3.js';

import { USDC } from '../../config/tokens';
import type { MicroUsd } from '../../domain/money';

/**
 * Q5 — the ledger figure comes from the CONFIRMED TRANSACTION, never the quote.
 *
 * Quoted values drift from chain permanently and break Rule 2 invisibly. This
 * reads the actual USDC delta out of `pre/postTokenBalances`.
 *
 * ⚠️ IT MEASURES ONE ACCOUNT, NOT THE OWNER, and that is the whole point of the
 * function. The earlier version summed the mint across every account the WALLET
 * owned — and the Grow Account and the ordinary spending ATA have the same
 * owner, so the number came out identical whether the dollars landed in the
 * savings account or straight back in the spending balance. The one check that
 * would catch DFlow ignoring `destinationTokenAccount` — an API version bump, a
 * proxy quietly dropping the parameter — was not being made. A Grow that missed
 * its destination would have been recorded as a successful Grow.
 *
 * Pure and exported so it can be tested without a network. `accountKeys` is the
 * transaction's resolved account list, lookup tables included, because a token
 * balance names its account by INDEX into that list and nothing else.
 */
export function usdcDeltaInto(
  meta: VersionedTransactionResponse['meta'],
  accountKeys: readonly string[],
  account: string,
  mint: string = USDC.mint,
): MicroUsd {
  if (!meta) return 0;

  const sum = (entries: typeof meta.preTokenBalances) =>
    (entries ?? [])
      .filter((b) => b.mint === mint && accountKeys[b.accountIndex] === account)
      .reduce((total, b) => total + BigInt(b.uiTokenAmount.amount), 0n);

  // An account created by this very transaction has no `pre` entry at all,
  // which is the common case for a first-ever Grow — it must read as zero,
  // not as "missing, skip this transaction".
  const delta = sum(meta.postTokenBalances) - sum(meta.preTokenBalances);
  return delta > 0n ? Number(delta) : 0;
}
