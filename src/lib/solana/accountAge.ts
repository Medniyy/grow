import { PublicKey } from '@solana/web3.js';

import { connection } from './connection';

/**
 * When an account first appeared on chain.
 *
 * This is what the day counter is built on, and it is deliberately NOT read
 * from local storage. A ledger date dies with the browser's site data — the
 * exact failure that showed `$0 grown` above `$1.57 kept` — and a counter that
 * resets to "day 1" is worse than no counter, because the number it destroys is
 * the one thing a saver cannot earn back. The Grow Account's own history
 * survives a wipe, a new browser and a new device, and a stranger can verify it.
 *
 * `getSignaturesForAddress` returns NEWEST FIRST, so the opening transaction is
 * the last entry of the last page. Pages are walked with `before`, which is why
 * this cannot be a single call.
 */

/** One page is the RPC maximum. */
const PAGE = 1000;

/**
 * Pages walked before giving up.
 *
 * A Grow Account holds one deposit per Grow, so five pages is several thousand
 * Grows — far past any real history. If a wallet ever did exceed it, the oldest
 * signature found is a LOWER BOUND on the age, so the counter understates rather
 * than inventing days. Understating is the safe direction for a number the user
 * is invited to share.
 */
const MAX_PAGES = 5;

/** Unix ms of the account's first transaction, or null if it has none. */
export async function fetchAccountOpenedAt(address: string): Promise<number | null> {
  const rpc = connection();
  const key = new PublicKey(address);

  let before: string | undefined;
  let oldestBlockTime: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await rpc.getSignaturesForAddress(key, { limit: PAGE, before });
    if (batch.length === 0) break;

    // `blockTime` is nullable on very old or pruned entries; keep walking back
    // rather than treating a missing timestamp as the answer.
    for (let i = batch.length - 1; i >= 0; i -= 1) {
      const time = batch[i].blockTime;
      if (time != null) {
        oldestBlockTime = time;
        break;
      }
    }

    if (batch.length < PAGE) break;
    before = batch[batch.length - 1].signature;
  }

  return oldestBlockTime == null ? null : oldestBlockTime * 1000;
}
