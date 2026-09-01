import { type GrowAction, isTerminal } from './growAction';
import type { MicroUsd } from './money';

/**
 * The ledger — Q1.
 *
 * `grown` is the sum of CONFIRMED Grow actions and nothing else. It is not the
 * wallet balance, it never decreases, and it starts at $0 for everyone no matter
 * what they already hold. The word in the UI is always "grown", never "holds".
 *
 * What the ledger deliberately cannot see: withdrawals. Someone can grow to
 * $1,199, unlock iPhone and move the money out, and the ledger still reads
 * $1,199 grown — which is why live holdings are displayed beside it everywhere
 * the total is published.
 */
export function grownMicro(actions: readonly GrowAction[]): MicroUsd {
  let total = 0;
  for (const a of actions) {
    if (a.status !== 'confirmed') continue;
    // A confirmed row with no on-chain figure is an integrity bug, not money.
    // Counting the quote here is exactly the drift Q5 forbids.
    if (a.usdcReceivedMicro == null) continue;
    total += a.usdcReceivedMicro;
  }
  return total;
}

/**
 * History this device has no record of.
 *
 * ⚠️ THIS IS PINNED ONCE, NOT RECOMPUTED. It was first written as a live
 * `max(ledger, kept)` and that is subtly, badly wrong: `kept` moves every time
 * a Grow lands, so the maximum absorbed the new money instead of adding to it.
 * Measured 2026-08-31 — a recovered ledger sitting at $1.57 kept, a $0.44 Grow
 * confirmed, and `max($0.44, $1.57)` read $1.57 both BEFORE and AFTER. The
 * delta was zero, so nothing unlocked, no percent mark fired and the whole
 * celebration was skipped on a Grow that had genuinely crossed a milestone.
 *
 * Measured once at load, the answer is stable: the ledger grows underneath it,
 * `kept` moves independently, and the total is simply the sum. A withdrawal
 * lowers `kept` and changes nothing, which is right — the ledger is deliberately
 * blind to withdrawals and `grown` does not decrease (Q1).
 *
 * Why any of this exists: local storage is not durable. Clearing site data wiped
 * a real session to `$0 grown` while the line beneath it still read `$1.57 kept`
 * — the same money, from two sources, contradicting itself in one glance. The
 * Grow Account is a pure function of the wallet and survives a wipe, a new
 * browser or a new device, so it is the half that decides.
 *
 * `kept` is null while UNKNOWN — an unread account, or a chain call that failed.
 * That is not zero, and nothing is recovered from it.
 */
export function recoveredMicro(ledgerMicro: MicroUsd, keptMicro: MicroUsd | null): MicroUsd {
  if (keptMicro == null) return 0;
  return Math.max(0, keptMicro - ledgerMicro);
}

/** Confirmed rows that carry no on-chain amount. Should always be empty. */
export function integrityIssues(actions: readonly GrowAction[]): readonly GrowAction[] {
  return actions.filter((a) => a.status === 'confirmed' && a.usdcReceivedMicro == null);
}

/**
 * Q4: the signature is the unique key.
 *
 * Re-inserting the same signature updates that row instead of adding a second
 * one, so a retry, a double-submit or a replayed confirmation can never count
 * the same dollar twice. Rows without a signature yet fall back to their local id.
 */
export function upsertAction(
  actions: readonly GrowAction[],
  incoming: GrowAction,
): readonly GrowAction[] {
  const matches = (a: GrowAction) =>
    incoming.signature != null ? a.signature === incoming.signature : a.id === incoming.id;

  // A row created locally gains its signature later — match on id too, so the
  // signed row updates the quoted row rather than forking from it.
  const index = actions.findIndex((a) => matches(a) || a.id === incoming.id);
  if (index === -1) return [...actions, incoming];

  const next = [...actions];
  next[index] = { ...next[index], ...incoming };
  return next;
}

/**
 * Everything not in a terminal state. Q3 reconciles these on cold start —
 * without it, an app killed mid-flow leaves money on-chain and off-ledger.
 */
export function unreconciledActions(actions: readonly GrowAction[]): readonly GrowAction[] {
  return actions.filter((a) => !isTerminal(a.status));
}
