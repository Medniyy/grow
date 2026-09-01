import { PublicKey } from '@solana/web3.js';

import { NATIVE_SOL_REFERENCE, tokenFor, WSOL } from '../../config/tokens';
import { connection } from './connection';

/**
 * Portfolio read — Q12.
 *
 * There is NO "all token programs" filter, so this is two calls, one per program
 * id, merged, plus `getBalance` for native SOL. Getting this wrong silently
 * hides every Token-2022 holding.
 */
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export type RawHolding = {
  readonly mint: string;
  /** Atomic units, summed across every account holding the mint. */
  readonly amount: bigint;
  readonly decimals: number;
  /**
   * The single biggest token account holding this mint, and what it holds.
   *
   * The sum is what a portfolio is worth; ONE account is what a single transfer
   * instruction can move. Growing from USDC moves money between two of the
   * user's own accounts, so it needs the account, not the total. Absent for
   * native SOL, which lives in no token account at all.
   */
  readonly largestAccount?: { readonly address: string; readonly amount: bigint };
};

export async function fetchHoldings(
  owner: string,
  /**
   * Token accounts to leave out entirely.
   *
   * ⚠️ THE GROW ACCOUNT BELONGS HERE. It is a USDC account owned by the user's
   * own wallet, so `getTokenAccountsByOwner` returns it like any other and the
   * spending balance silently absorbed the savings — measured on mainnet
   * 2026-08-31: $669.60 spendable plus $5.27 kept was displayed as "$674.86
   * available", and every Grow made that number go UP. Counting savings as
   * spendable is the exact fiction the Grow Account exists to remove.
   */
  exclude: ReadonlySet<string> = new Set(),
): Promise<readonly RawHolding[]> {
  const rpc = connection();
  const key = new PublicKey(owner);

  const [classic, token2022, lamports] = await Promise.all([
    rpc.getParsedTokenAccountsByOwner(key, { programId: TOKEN_PROGRAM_ID }),
    rpc.getParsedTokenAccountsByOwner(key, { programId: TOKEN_2022_PROGRAM_ID }),
    rpc.getBalance(key),
  ]);

  const holdings = new Map<string, RawHolding>();

  for (const { pubkey, account } of [...classic.value, ...token2022.value]) {
    const address = pubkey.toBase58();
    if (exclude.has(address)) continue;

    const info = account.data.parsed?.info;
    if (!info) continue;
    const mint: string = info.mint;
    const amount = BigInt(info.tokenAmount?.amount ?? '0');
    const decimals: number = info.tokenAmount?.decimals ?? 0;
    if (amount === 0n) continue;

    // The same mint can sit in several accounts — this wallet holds two USDC
    // accounts and a tested one held fourteen. Sum rather than overwrite, and
    // keep track of which single account holds the most.
    const existing = holdings.get(mint);
    const largestAccount =
      existing?.largestAccount && existing.largestAccount.amount >= amount
        ? existing.largestAccount
        : { address, amount };

    holdings.set(mint, {
      mint,
      decimals,
      amount: existing ? existing.amount + amount : amount,
      largestAccount,
    });
  }

  if (lamports > 0) {
    // Native SOL swaps as WSOL with wrapAndUnwrapSol — see config/tokens.
    const existing = holdings.get(WSOL.mint);
    holdings.set(WSOL.mint, {
      mint: WSOL.mint,
      decimals: WSOL.decimals,
      amount: (existing?.amount ?? 0n) + BigInt(lamports),
    });
  }

  return [...holdings.values()];
}

/**
 * ONE token account's balance, in atomic units. This is what `kept` IS — the
 * Grow Account's own USDC, read from the chain rather than from a local record
 * of what the app believes it did.
 *
 * ⚠️ Read the ACCOUNT, never `getTokenAccountsByOwner`. That RPC takes an
 * OWNER (a token account's authority), and the Grow Account's authority is the
 * user's wallet, not itself — so asking it for the Grow Account's address
 * returns an empty list and `kept` reads $0 forever, while the money sits
 * safely on chain. Verified against mainnet 2026-08-31.
 *
 * Passing the WALLET instead is worse, not better: one owner may hold the same
 * mint in many accounts (this wallet holds 2, a tested one held 14), so a sum
 * over the owner counts the SPENDING balance as savings — $669 of walking-
 * around money displayed as "kept". That is precisely the fiction the Grow
 * Account exists to remove.
 *
 * `getAccountInfo` with `jsonParsed` is deliberate: it is already on the
 * proxy's method allowlist, so this needs no backend change, unlike
 * `getTokenAccountBalance` — which the proxy blocks.
 *
 * An account that does not exist yet is not an error. It is zero, and it is the
 * state every Grow Account starts in.
 */
export async function fetchTokenAccountBalance(address: string): Promise<bigint> {
  const parsed = await connection().getParsedAccountInfo(new PublicKey(address));
  const data = parsed.value?.data;
  if (!data) return 0n;
  if (!('parsed' in data)) throw new Error('That address is not a token account.');

  const amount = data.parsed?.info?.tokenAmount?.amount;
  if (typeof amount !== 'string') throw new Error('That address holds no token amount.');
  return BigInt(amount);
}

export function symbolFor(mint: string): string {
  if (mint === NATIVE_SOL_REFERENCE) return 'SOL';
  return tokenFor(mint)?.symbol ?? `${mint.slice(0, 4)}…`;
}
