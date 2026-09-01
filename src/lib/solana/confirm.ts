import type { MicroUsd } from '../../domain/money';
import { connection } from './connection';
import { usdcDeltaFrom } from './usdcDelta';

export { usdcDeltaFrom } from './usdcDelta';

export type ConfirmOutcome =
  | { readonly status: 'confirmed'; readonly usdcReceivedMicro: MicroUsd }
  | { readonly status: 'failed'; readonly reason: string }
  | { readonly status: 'expired' };

/**
 * Confirms at `confirmed` (Q9) by polling signature status against the
 * `lastValidBlockHeight` FROM THE ORDER RESPONSE. A freshly fetched height would
 * move the goalposts and could wait forever on an already-expired transaction.
 *
 * Polled explicitly rather than via `confirmTransaction`, whose blockheight
 * strategy also demands the blockhash — which DFlow does not return.
 */
export async function confirmGrow(
  signature: string,
  lastValidBlockHeight: number,
  owner: string,
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
        return readOutcome(signature, owner);
      }
    } else {
      // Not seen yet. Once the chain passes the order's block height it never
      // will be — that is expiry, not a slow network.
      const height = await rpc.getBlockHeight('confirmed').catch(() => 0);
      if (height > lastValidBlockHeight) return { status: 'expired' };
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: 'failed', reason: 'timed out waiting for confirmation' };
}

async function readOutcome(signature: string, owner: string): Promise<ConfirmOutcome> {
  const tx = await connection()
    .getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    .catch(() => null);

  if (!tx) return { status: 'failed', reason: 'confirmed but unreadable' };
  if (tx.meta?.err) return { status: 'failed', reason: JSON.stringify(tx.meta.err) };
  return { status: 'confirmed', usdcReceivedMicro: usdcDeltaFrom(tx.meta, owner) };
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

  return { status: 'failed', reason: 'timed out waiting for confirmation' };
}

/** Used by cold-start reconciliation to classify a row we never saw finish. */
export async function checkSignature(
  signature: string,
  lastValidBlockHeight: number,
  owner: string,
): Promise<ConfirmOutcome> {
  const rpc = connection();
  const tx = await rpc
    .getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
    .catch(() => null);

  if (tx) {
    if (tx.meta?.err) return { status: 'failed', reason: JSON.stringify(tx.meta.err) };
    return { status: 'confirmed', usdcReceivedMicro: usdcDeltaFrom(tx.meta, owner) };
  }

  const height = await rpc.getBlockHeight('confirmed').catch(() => 0);
  return height > lastValidBlockHeight ? { status: 'expired' } : { status: 'failed', reason: 'still unknown' };
}
