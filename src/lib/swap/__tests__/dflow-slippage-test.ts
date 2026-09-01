/**
 * Grow never executes at DFlow's `auto` slippage.
 *
 * `auto` is tuned for a bot that signs the instant it quotes — measured on
 * mainnet it returned 5 bps for USDT, 20 for SOL and 50 for a meme coin. Grow
 * always has a human reading a wallet dialog in between, and a MORI COIN Grow
 * at `auto` failed simulation with `SlippageLimitExceeded` (0x3a99) on
 * 2026-08-31 without ever leaving the wallet.
 */
const mockFetchOrder = jest.fn();

// Referenced LAZILY inside a wrapper. `jest.mock` factories are hoisted above
// every `const`, so reading `mockFetchOrder` directly in the object literal
// captures the temporal-dead-zone `undefined` and every call throws
// "fetchOrder is not a function".
jest.mock('../../dflow/client', () => ({
  fetchOrder: (...args: unknown[]) => mockFetchOrder(...args),
}));

import { GROW_SLIPPAGE_BPS, UNLOCK_PAD_BPS } from '../../../config/limits';
import { dflowSwapPort } from '../dflow';

const MORI = '8ZHE4ow1a2jjxuoMfyExuNamQNALv5ekZhsBn5nMDf5e';
const OWNER = 'EYv6iGu4BPA44HYhsGFApu4pou5d9LcYVooWsvUznpiP';
const GROW_ACCOUNT = 'DYPanRenpQpS6p8FWEB1s4EuEmoAXnQ5khiDes4H2umG';

const order = {
  inputMint: MORI,
  inAmount: '195260000000',
  outAmount: '1016400',
  minOutAmount: '1001150',
  slippageBps: GROW_SLIPPAGE_BPS,
  routePlan: [{ venue: 'Raydium CLMM' }],
  priceImpactPct: '0',
  transaction: 'base64==',
  lastValidBlockHeight: 1234,
};

beforeEach(() => {
  mockFetchOrder.mockReset();
  mockFetchOrder.mockResolvedValue(order);
});

describe('slippage is explicit, never auto', () => {
  it('sends an explicit tolerance when building the transaction', async () => {
    await dflowSwapPort.buildOrder({
      inputMint: MORI,
      inputAmountAtomic: '195260000000',
      userPublicKey: OWNER,
      destinationTokenAccount: GROW_ACCOUNT,
    });
    expect(mockFetchOrder.mock.calls[0][0].slippageBps).toBe(GROW_SLIPPAGE_BPS);
  });

  it('quotes at the SAME tolerance it will execute at', async () => {
    // The quote is what the user is shown as "at least $X". Quoting tighter
    // than we execute would display a promise the transaction never made.
    await dflowSwapPort.quote({
      inputMint: MORI,
      inputAmountAtomic: '195260000000',
      inputPriceUsd: 0.0052,
      inputDecimals: 9,
    });
    expect(mockFetchOrder.mock.calls[0][0].slippageBps).toBe(GROW_SLIPPAGE_BPS);
  });

  it('stays within the unlock pad, so a promised milestone cannot be missed', async () => {
    // UNLOCK_PAD_BPS is what lets Grow say "this unlocks Coffee" from
    // minOutAmount. A tolerance wider than the pad would let a Grow land under
    // the milestone it just promised — a broken commitment, not a rounding
    // difference. If this fails, the two constants were changed apart.
    expect(GROW_SLIPPAGE_BPS).toBeLessThanOrEqual(UNLOCK_PAD_BPS);
  });

  it('still carries the Grow Account as the destination', async () => {
    // Widening slippage must not disturb the reason the swap exists.
    await dflowSwapPort.buildOrder({
      inputMint: MORI,
      inputAmountAtomic: '195260000000',
      userPublicKey: OWNER,
      destinationTokenAccount: GROW_ACCOUNT,
    });
    expect(mockFetchOrder.mock.calls[0][0].destinationTokenAccount).toBe(GROW_ACCOUNT);
  });
});
