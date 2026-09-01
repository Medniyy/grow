/**
 * DFlow Trading API — verified against the live endpoint, not only the docs.
 *
 * `/order` is a one-call quote+build. Omit `userPublicKey` and it returns price
 * only; include it and the response also carries a base64 v0 VersionedTransaction.
 * There is no submit endpoint and no order id for spot orders — we broadcast
 * ourselves and track by signature.
 */

export type DFlowRoutePlanStep = {
  readonly venue: string;
  readonly marketKey: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inAmount: string;
  readonly outAmount: string;
  readonly inputMintDecimals: number;
  readonly outputMintDecimals: number;
};

export type DFlowOrder = {
  readonly inputMint: string;
  readonly inAmount: string;
  readonly outputMint: string;
  /** Expected output, atomic. NOT what the ledger records — see Q5. */
  readonly outAmount: string;
  readonly otherAmountThreshold: string;
  /**
   * The guaranteed floor, atomic. This is the number the "may we promise this
   * unlock?" predicate needs — no modelling required (Q2).
   */
  readonly minOutAmount: string;
  readonly slippageBps: number;
  readonly platformFee: { readonly amount: string; readonly feeBps: number; readonly mode: string } | null;
  readonly priceImpactPct: string;
  readonly routePlan: readonly DFlowRoutePlanStep[];
  readonly contextSlot: number;
  readonly executionMode: string;

  /** Present only when `userPublicKey` was supplied. Base64 v0 transaction. */
  readonly transaction?: string;
  /** Q3 uses THIS value for confirmation, never a freshly fetched one. */
  readonly lastValidBlockHeight?: number;
  readonly prioritizationFeeLamports?: number;
  readonly computeUnitLimit?: number;
  readonly prioritizationType?: unknown;
};

/** Errors come back as `{ msg, code }`, not an HTTP-shaped error body. */
export type DFlowError = { readonly msg: string; readonly code: string | number };

export function isDFlowError(value: unknown): value is DFlowError {
  return typeof value === 'object' && value !== null && 'msg' in value && 'code' in value;
}

export class DFlowRequestError extends Error {
  readonly code: string | number;
  constructor(error: DFlowError) {
    // `route_not_found` is overwhelmingly an amount passed in UI units instead
    // of atomic ones. Say so, rather than showing the raw code to a user.
    super(
      error.code === 'route_not_found'
        ? 'No route for that amount right now. Try a slightly larger amount.'
        : error.msg,
    );
    this.name = 'DFlowRequestError';
    this.code = error.code;
  }
}
