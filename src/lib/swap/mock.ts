import type { GrowOrder, GrowQuote, QuoteParams, SwapPort } from './port';

/**
 * Rehearsal port — Q14 requires this.
 *
 * The demo runs on mainnet with real funds, and repeating the flow dozens of
 * times while building must not cost money. Unit tests cannot hit mainnet at all.
 *
 * It models the one behaviour that matters: `minOutMicro` is strictly below
 * `outMicro`, so any code that confuses the expected output with the guaranteed
 * floor fails here rather than in front of judges.
 *
 * ⚠️ It must also agree with the screen the user is looking at. This port used
 * to read the atomic input count as micro-dollars — an identity that holds only
 * for USDC. Rehearsing a $1 Grow from a token priced at $0.0166 therefore
 * reported $60.25, wrote $60.13 to the ledger and unlocked seven milestones off
 * one tap. A rehearsal that lies is worse than no rehearsal.
 */
const SLIPPAGE_BPS = 20;

function fakeQuote(params: QuoteParams): GrowQuote {
  // Value the input the same way the caller sized it, so the round trip closes:
  // ask for $1 of anything and the mock answers with $1.
  const { inputPriceUsd, inputDecimals } = params;
  const outMicro =
    inputPriceUsd !== undefined && inputDecimals !== undefined && inputPriceUsd > 0
      ? Math.round((Number(params.inputAmountAtomic) / 10 ** inputDecimals) * inputPriceUsd * 1e6)
      : // No price supplied: the legacy identity, correct only for 6-decimal
        // dollar-pegged input, which is exactly where it is still safe.
        Number(params.inputAmountAtomic);
  return {
    inputMint: params.inputMint,
    inputAmountAtomic: params.inputAmountAtomic,
    outMicro,
    minOutMicro: outMicro - Math.ceil((outMicro * SLIPPAGE_BPS) / 10_000),
    slippageBps: SLIPPAGE_BPS,
    venues: ['MockVenue'],
    priceImpactPct: 0,
  };
}

export const mockSwapPort: SwapPort = {
  async quote(params) {
    return fakeQuote(params);
  },
  async buildOrder(params): Promise<GrowOrder> {
    return {
      ...fakeQuote(params),
      transaction: '',
      lastValidBlockHeight: Number.MAX_SAFE_INTEGER,
    };
  },
};
