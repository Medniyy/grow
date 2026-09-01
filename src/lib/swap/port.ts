import type { MicroUsd } from '../../domain/money';

/**
 * The money path behind one interface, so Stage 4 can be built and the whole
 * flow rehearsed against a mock without spending real money on mainnet.
 */
export type GrowQuote = {
  readonly inputMint: string;
  readonly inputAmountAtomic: string;
  /** Expected USDC out. Display only — Q5 forbids this reaching the ledger. */
  readonly outMicro: MicroUsd;
  /** Guaranteed floor. The unlock promise in Q2 is made against THIS. */
  readonly minOutMicro: MicroUsd;
  readonly slippageBps: number;
  readonly venues: readonly string[];
  readonly priceImpactPct: number;
};

export type GrowOrder = GrowQuote & {
  /** Base64 v0 VersionedTransaction. */
  readonly transaction: string;
  readonly lastValidBlockHeight: number;
};

export type QuoteParams = {
  readonly inputMint: string;
  readonly inputAmountAtomic: string;
  /**
   * What the input is worth, for the REHEARSAL PORT ONLY.
   *
   * The live port ignores both: DFlow prices the trade itself and its answer is
   * the only one that counts. The mock has no market to ask, and without them it
   * fell back to reading atomic units as micro-dollars — true only for USDC, and
   * off by a factor of `1/price` for everything else. A $1 Grow from a $0.0166
   * token rehearsed as a $60.25 one.
   */
  readonly inputPriceUsd?: number;
  readonly inputDecimals?: number;
  /** Where the USDC lands. The Grow Account, not the spending wallet. */
  readonly destinationTokenAccount?: string;
};

export type SwapPort = {
  /** Price only — no `userPublicKey`, nothing built, nothing to sign. */
  quote(params: QuoteParams, signal?: AbortSignal): Promise<GrowQuote>;
  /** Quote plus a built transaction for this wallet. */
  buildOrder(params: QuoteParams & { userPublicKey: string }, signal?: AbortSignal): Promise<GrowOrder>;
};
