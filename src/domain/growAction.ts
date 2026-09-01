import type { MicroUsd } from './money';

/**
 * A Grow — one swap into USDC that, once confirmed, adds to the ledger.
 *
 * Q3: the row is written BEFORE the transaction is submitted, carrying the
 * signature and `lastValidBlockHeight`. Writing only on confirmation loses money
 * permanently if the app is killed after signing — the USDC lands in the wallet
 * and the ledger never counts it.
 */
export type GrowActionStatus =
  | 'quoted'
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'expired';

export const TERMINAL_STATUSES: readonly GrowActionStatus[] = ['confirmed', 'failed', 'expired'];

export function isTerminal(status: GrowActionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type GrowAction = {
  /** Local id. Exists from the moment of quoting, before any signature does. */
  readonly id: string;
  readonly status: GrowActionStatus;

  readonly inputMint: string;
  /** Atomic units as a string — never a float, never a UI amount. */
  readonly inputAmountAtomic: string;

  /** What the quote said. Q5: NEVER authoritative for the ledger. */
  readonly quotedOutMicro: MicroUsd;
  /** The guaranteed floor from `minOutAmount`. Q2 promises unlocks off this. */
  readonly minOutMicro: MicroUsd;

  /** Q4: the idempotency key, once broadcasting has produced one. */
  readonly signature: string | null;
  /** Q3: taken from the order response, not freshly fetched. */
  readonly lastValidBlockHeight: number | null;

  /** Q5: parsed from `pre/postTokenBalances` on the confirmed transaction. */
  readonly usdcReceivedMicro: MicroUsd | null;

  readonly createdAt: number;
  readonly updatedAt: number;
};

/**
 * Legal transitions. Anything absent is a bug, and is thrown rather than
 * tolerated — a silent illegal transition on the money path is how a ledger
 * ends up wrong in a way nobody notices.
 */
const ALLOWED: Record<GrowActionStatus, readonly GrowActionStatus[]> = {
  quoted: ['submitted', 'failed', 'expired'],
  // A fast confirmation can arrive before we ever record `pending`.
  submitted: ['pending', 'confirmed', 'failed', 'expired'],
  pending: ['confirmed', 'failed', 'expired'],
  confirmed: [],
  failed: [],
  expired: [],
};

export function canTransition(from: GrowActionStatus, to: GrowActionStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(
  action: GrowAction,
  to: GrowActionStatus,
  patch: Partial<GrowAction> = {},
  now: number = Date.now(),
): GrowAction {
  if (!canTransition(action.status, to)) {
    throw new Error(`GrowAction ${action.id}: illegal transition ${action.status} -> ${to}`);
  }
  if (to === 'confirmed' && patch.usdcReceivedMicro == null && action.usdcReceivedMicro == null) {
    throw new Error(
      `GrowAction ${action.id}: cannot confirm without usdcReceivedMicro read from the transaction`,
    );
  }
  return { ...action, ...patch, status: to, updatedAt: now };
}
