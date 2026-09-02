import type { VersionedTransactionResponse } from '@solana/web3.js';

import type { MicroUsd } from '../../domain/money';
import { connection } from './connection';
import { usdcDeltaInto } from './usdcDelta';

export { usdcDeltaInto } from './usdcDelta';

export type ConfirmOutcome =
  | { readonly status: 'confirmed'; readonly usdcReceivedMicro: MicroUsd }
  /** Landed, and went wrong. Terminal: there is nothing left to wait for. */
  | {
      readonly status: 'failed';
      readonly reason: string;
      /** What to tell the user, when "it did not go through" would be a lie. */
      readonly message?: string;
    }
  /** The chain moved past the transaction's expiry without ever seeing it. */
  | { readonly status: 'expired' }
  /**
   * ⚠️ NOT A FAILURE, AND THIS DISTINCTION IS LOAD-BEARING.
   *
   * We stopped waiting; the chain did not stop working. A Grow that took longer
   * than the poll window used to be recorded as `failed`, which is TERMINAL —
   * reconciliation skips terminal rows, so a slow but perfectly successful Grow
   * was marked a failure forever and the user was told it did not go through
   * while their money had moved. A timeout leaves the row open for the next
   * cold start to resolve.
   */
  | { readonly status: 'timeout' };

/**
 * Confirms at `confirmed` (Q9) by polling signature status against the
 * `lastValidBlockHeight` FROM THE ORDER RESPONSE. A freshly fetched height would
 * move the goalposts and could wait forever on an already-expired transaction.
 *
 * Polled explicitly rather than via `confirmTransaction`, whose blockheight
 * strategy also demands the blockhash — which DFlow does not return.
 *
 * `destination` is the account the dollars are supposed to arrive in, and the
 * amount is measured THERE. See `usdcDeltaInto`.
 */
export async function confirmGrow(
  signature: string,
  lastValidBlockHeight: number,
  destination: string,
  { intervalMs = 1000, timeoutMs = 90_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<ConfirmOutcome> {
  const rpc = connection();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await rpc.getSignatureStatuses([signature]).catch(() => null);
    const value = status?.value?.[0];

    if (value) {
      if (value.err) return { status: 'failed', reason: JSON.stringify(value.err) };
      if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') {
        return readOutcome(signature, destination);
      }
    } else {
      // Not seen yet. Once the chain passes the order's block height it never
      // will be — that is expiry, not a slow network.
      const height = await rpc.getBlockHeight('confirmed').catch(() => 0);
      if (height > lastValidBlockHeight) return { status: 'expired' };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: 'timeout' };
}

/**
 * The transaction's account list, lookup tables resolved.
 *
 * Token balances identify their account by index into this list, so without it
 * there is no way to ask "did the money land in THAT account". Null when the
 * list cannot be built — a v0 transaction whose lookup tables are missing from
 * `meta` — which is a read we could not complete, never a pass.
 */
function accountKeysOf(tx: VersionedTransactionResponse): readonly string[] | null {
  try {
    const keys = tx.transaction.message.getAccountKeys({
      accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined,
    });
    const out: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      out.push(keys.get(i)?.toBase58() ?? '');
    }
    return out;
  } catch {
    return null;
  }
}

async function readOutcome(signature: string, destination: string): Promise<ConfirmOutcome> {
  const tx = await connection()
    .getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    .catch(() => null);

  if (!tx) return { status: 'failed', reason: 'confirmed but unreadable' };
  if (tx.meta?.err) return { status: 'failed', reason: JSON.stringify(tx.meta.err) };

  const keys = accountKeysOf(tx);
  if (!keys) return { status: 'failed', reason: 'confirmed but its accounts could not be resolved' };

  const landed = usdcDeltaInto(tx.meta, keys, destination);

  /**
   * ⚠️ ZERO IS NEVER A $0 GROW. A confirmed swap that put nothing in the Grow
   * Account is either a read that failed or a swap that went somewhere else,
   * and recording it as a confirmed row worth nothing would bake a permanent
   * lie into a ledger whose whole claim is that it can be checked on chain.
   */
  if (landed <= 0) {
    return {
      status: 'failed',
      reason: 'confirmed, but no USDC arrived in the Grow Account',
      message:
        'That went through on chain, but the dollars did not land in your Grow. Check your wallet balance before trying again.',
    };
  }

  return { status: 'confirmed', usdcReceivedMicro: landed };
}

/**
 * Wait for one of OUR OWN transactions to land. Status only — no USDC delta.
 *
 * ⚠️ NEVER use `connection.confirmTransaction` here. It subscribes over a
 * WEBSOCKET (`signatureSubscribe`), and Grow talks to the chain through an HTTP
 * proxy that serves no websocket at all. The visible symptom is a button stuck
 * on "Opening…" forever and a bare `ws error: undefined` — while the
 * transaction has usually already succeeded on chain.
 */
export async function awaitSignature(
  signature: string,
  lastValidBlockHeight: number,
  { intervalMs = 1000, timeoutMs = 90_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<ConfirmOutcome> {
  const rpc = connection();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await rpc.getSignatureStatuses([signature]).catch(() => null);
    const value = status?.value?.[0];

    if (value) {
      if (value.err) return { status: 'failed', reason: JSON.stringify(value.err) };
      if (value.confirmationStatus === 'confirmed' || value.confirmationStatus === 'finalized') {
        return { status: 'confirmed', usdcReceivedMicro: 0 };
      }
    } else {
      const height = await rpc.getBlockHeight('confirmed').catch(() => 0);
      if (height > lastValidBlockHeight) return { status: 'expired' };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: 'timeout' };
}

/** Used by cold-start reconciliation to classify a row we never saw finish. */
export async function checkSignature(
  signature: string,
  lastValidBlockHeight: number,
  destination: string,
): Promise<ConfirmOutcome> {
  const rpc = connection();
  const tx = await rpc
    .getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    .catch(() => null);

  if (tx) {
    if (tx.meta?.err) return { status: 'failed', reason: JSON.stringify(tx.meta.err) };
    const keys = accountKeysOf(tx);
    if (!keys) {
      return { status: 'failed', reason: 'confirmed but its accounts could not be resolved' };
    }
    const landed = usdcDeltaInto(tx.meta, keys, destination);
    if (landed <= 0) {
      return { status: 'failed', reason: 'confirmed, but no USDC arrived in the Grow Account' };
    }
    return { status: 'confirmed', usdcReceivedMicro: landed };
  }

  const height = await rpc.getBlockHeight('confirmed').catch(() => 0);
  // Still unknown is NOT terminal — the caller leaves the row open and asks
  // again next launch. Only expiry closes a row the chain has never seen.
  return height > lastValidBlockHeight ? { status: 'expired' } : { status: 'timeout' };
}
