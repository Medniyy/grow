import { GROW_SLIPPAGE_BPS } from '../../config/limits';
import { USDC, WSOL } from '../../config/tokens';
import { fetchOrder } from '../dflow/client';
import type { DFlowOrder } from '../dflow/types';
import type { GrowOrder, GrowQuote, QuoteParams, SwapPort } from './port';

function toQuote(order: DFlowOrder): GrowQuote {
  return {
    inputMint: order.inputMint,
    inputAmountAtomic: order.inAmount,
    // USDC has 6 decimals and micro-USD is 1e-6, so these atomic units ARE
    // micro-dollars. No conversion, therefore no rounding, therefore no drift.
    outMicro: Number(order.outAmount),
    minOutMicro: Number(order.minOutAmount),
    slippageBps: order.slippageBps,
    venues: order.routePlan.map((step) => step.venue),
    priceImpactPct: Number(order.priceImpactPct),
  };
}

export const dflowSwapPort: SwapPort = {
  async quote(params: QuoteParams, signal?: AbortSignal) {
    const order = await fetchOrder(
      {
        inputMint: params.inputMint,
        outputMint: USDC.mint,
        amount: params.inputAmountAtomic,
        slippageBps: GROW_SLIPPAGE_BPS,
        wrapAndUnwrapSol: params.inputMint === WSOL.mint,
      },
      signal,
    );
    return toQuote(order);
  },

  async buildOrder(params, signal?: AbortSignal): Promise<GrowOrder> {
    const order = await fetchOrder(
      {
        inputMint: params.inputMint,
        outputMint: USDC.mint,
        amount: params.inputAmountAtomic,
        slippageBps: GROW_SLIPPAGE_BPS,
        userPublicKey: params.userPublicKey,
        wrapAndUnwrapSol: params.inputMint === WSOL.mint,
        destinationTokenAccount: params.destinationTokenAccount,
        // The default compute budget is not enough for a multi-hop route — see
        // `OrderParams`. Only here: the quote above builds no transaction.
        dynamicComputeUnitLimit: true,
      },
      signal,
    );

    if (!order.transaction || order.lastValidBlockHeight == null) {
      throw new Error('DFlow returned no transaction to sign.');
    }

    return {
      ...toQuote(order),
      transaction: order.transaction,
      lastValidBlockHeight: order.lastValidBlockHeight,
    };
  },
};
