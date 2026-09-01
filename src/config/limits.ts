/**
 * Hard limits on the money path.
 *
 * Q14 put the demo on MAINNET WITH REAL FUNDS, so these are not cosmetic
 * validation — they are the only thing between a fat-fingered amount and real
 * money moving during a live demo. They land in Stage 0, before any code can
 * spend anything.
 */

/** M4 — below this, fees dominate the number the user is shown. */
export const MIN_GROW_USD = 0.25;

/**
 * Hard ceiling on a single Grow. Enforced at the input, not just the button.
 * Demo default is deliberately small; a full Coffee -> Cola run costs ~$2.
 */
export const MAX_GROW_USD = 25;

/**
 * Q2 — pad the input so the *guaranteed minimum* output clears the gap to the
 * next milestone. Overshooting is free: the extra lands in the user's own
 * savings. An unlock is only ever promised when `minOutAmount` guarantees it.
 */
export const UNLOCK_PAD_BPS = 200;

/**
 * Slippage tolerance for every Grow.
 *
 * DFlow's `auto` is tuned for a BOT that signs the instant it quotes: it
 * returned 5 bps for USDT, 20 for SOL and 50 for a meme coin. Grow always has a
 * human reading a wallet dialog between build and execution, and a volatile
 * token can walk straight through 50 bps in those seconds. Measured on mainnet
 * 2026-08-31: a MORI COIN Grow at `auto` failed simulation with
 * `SlippageLimitExceeded` (0x3a99) having never left the wallet.
 *
 * Deliberately BELOW `UNLOCK_PAD_BPS`. The pad is what lets Grow promise "this
 * unlocks Coffee" from `minOutAmount`; a tolerance wider than the pad would let
 * a Grow land under the milestone it just promised, which breaks a user-facing
 * commitment rather than a number. These two move together or not at all.
 */
export const GROW_SLIPPAGE_BPS = 150;

/**
 * Q12 — portfolio display filter. Keeps §11's list clean of airdropped spam.
 *
 * ⚠️ TIED TO `MIN_GROW_USD`, never a number of its own. At $0.50 against a
 * $0.25 floor there was a band where a holding was growable and invisible:
 * measured on the demo wallet 2026-09-02, Nyan Cat ($0.41), BARKcoin ($0.29)
 * and BaoBao ($0.29) were all offerable and none of them were shown. Dust is
 * the holding a user is most willing to part with and least likely to clear on
 * purpose — hiding exactly that band is the opposite of what this screen is
 * for. Airdropped spam is caught by having no price at all, which lands at
 * `valueMicro` 0 and stays below any floor.
 */
export const MIN_DISPLAY_VALUE_USD = MIN_GROW_USD;
export const MAX_DISPLAYED_TOKENS = 8;

/** Q9 — pending copy changes at this point, so the wait never feels stuck. */
export const PENDING_COPY_SHIFT_MS = 8000;

/**
 * The amount the wheel lands on when the selected asset can cover it.
 *
 * The rule is `min($1, whole balance)`: a normal holding defaults to a dollar,
 * and an asset too small to reach one defaults to all of it. Below a dollar
 * there is nothing worth leaving behind, so Grow reads as a cleanup action
 * without needing a second mode.
 */
export const DEFAULT_GROW_USD = 1;

/**
 * Headroom on the `ALL` rung, so spending a whole balance cannot ask for more
 * than is held.
 *
 * The input amount is derived as `target / price`, and both that division and
 * the atomic conversion round. Rounding UP by a single atomic unit is the
 * difference between a Grow and an insufficient-funds failure on the one rung
 * where there is nothing in reserve. This is rounding headroom, not slippage —
 * slippage is `GROW_SLIPPAGE_BPS` and applies to the output.
 */
export const ALL_RUNG_SHAVE_BPS = 10;

/**
 * Lamports left behind when growing SOL, expressed in dollars.
 *
 * Native SOL is the only holding that also pays for the transaction that spends
 * it. An `ALL` rung over the full balance would leave nothing to sign with, so
 * the wheel never offers the last of it.
 */
export const SOL_FEE_RESERVE_USD = 2;

/**
 * Above this, the route is bad enough that the user needs to decide rather than
 * be told afterwards.
 *
 * DFlow's own `priceImpactPct` is the measure, NOT the gap between the app's
 * price feed and the quote: an illiquid token can differ from the feed by more
 * than this while routing perfectly well, and blocking on that would refuse the
 * exact small holdings this screen exists to clean up.
 */
export const HIGH_IMPACT_PCT = 5;

/**
 * A 24h move worth saying something about when that asset is chosen.
 *
 * ⚠️ THIS IS CONTEXT, NOT A VERDICT, AND IT LIVES ON THE GROW SCREEN. Home once
 * answered any red day by replacing the offer with a remark about the market;
 * tested, that was a wall in front of the one thing the user came to do, on
 * every load, with no way past it. Nothing may slow saving down.
 *
 * A moving POSITION is different from "the market": it is one asset, the user
 * picked it, and selling it now is what makes the move real. So it is said
 * once, at the moment of choosing, about that asset by name, and it can be
 * dismissed.
 *
 * Deliberately low. At 10% the screen had nothing to say about an asset down 3%
 * — which is a real day, and the user noticed the silence. Below this it is
 * genuinely noise: a stablecoin's peg drift lives here, and so does the ±1% a
 * liquid token does before breakfast.
 */
export const MOVED_24H_PCT = 3;
