import { MAX_GROW_USD, MIN_GROW_USD, UNLOCK_PAD_BPS } from '../config/limits';
import { addBps, type MicroUsd, toAtomic, usdToMicro } from './money';

/**
 * Q2 — the most emotionally loaded moment in the product.
 *
 * A user taps `GROW $0.79 to unlock Meal` and receives $0.78. Three rules stop
 * that from silently failing:
 *
 *  1. Pad the input so the GUARANTEED MINIMUM output clears the gap. Overshooting
 *     is free — the extra lands in the user's own savings.
 *  2. Only render the unlock promise when `minOutAmount` guarantees it. Otherwise
 *     the button just reads `GROW $1` and the unlock is a pleasant surprise.
 *  3. Never retract a promise that has already been made.
 */

/** Input target for closing a gap, padded so slippage cannot eat the promise. */
export function paddedTarget(gapMicro: MicroUsd): MicroUsd {
  return addBps(gapMicro, UNLOCK_PAD_BPS);
}

/**
 * May we show "…to unlock Meal"? Only if the floor gets there — the expected
 * output is not a promise, it is a hope.
 */
export function canPromiseUnlock(
  grown: MicroUsd,
  minOutMicro: MicroUsd,
  nextThresholdMicro: MicroUsd,
): boolean {
  return grown + minOutMicro >= nextThresholdMicro;
}

/**
 * The `$0.01 to go.` state — how far the guaranteed floor lands short of the
 * next milestone. Null when it clears, so the caller has one thing to check.
 */
export function shortfall(
  grown: MicroUsd,
  minOutMicro: MicroUsd,
  nextThresholdMicro: MicroUsd,
): MicroUsd | null {
  const gap = nextThresholdMicro - (grown + minOutMicro);
  return gap > 0 ? gap : null;
}

/**
 * How much of an input token is worth `targetMicro` of USD.
 *
 * Float division happens here and only here: the input amount does not need to
 * be exact, because Q5 reads the ledger figure back off the confirmed
 * transaction. What must never be approximate is the atomic conversion itself,
 * which goes through `toAtomic`.
 */
export function inputAtomicFor(
  targetMicro: MicroUsd,
  priceUsd: number,
  decimals: number,
): bigint {
  if (!(priceUsd > 0)) throw new Error('inputAtomicFor: price must be positive');
  const targetUsd = targetMicro / 1_000_000;
  return toAtomic(targetUsd / priceUsd, decimals);
}

/** USD value of a holding, in micro-USD. Zero for anything unpriceable. */
export function holdingValueMicro(
  amountAtomic: bigint,
  decimals: number,
  priceUsd: number | undefined,
): MicroUsd {
  if (!priceUsd || !Number.isFinite(priceUsd)) return 0;
  const ui = Number(amountAtomic) / 10 ** decimals;
  return usdToMicro(Math.floor(ui * priceUsd * 1_000_000) / 1_000_000);
}

/**
 * The spend guard — Q14.
 *
 * The demo runs on MAINNET WITH REAL FUNDS, so a fat-fingered custom amount is a
 * real-money mistake, not a validation message. Pure and separately tested
 * because it is the last thing standing between a typo and a live demo.
 */
export type AmountProblem =
  | { readonly kind: 'too-small'; readonly message: string }
  | { readonly kind: 'too-large'; readonly message: string }
  | { readonly kind: 'not-a-number'; readonly message: string };

export function validateGrowAmount(targetMicro: MicroUsd): AmountProblem | null {
  if (!Number.isFinite(targetMicro) || targetMicro <= 0) {
    return { kind: 'not-a-number', message: 'Enter an amount to grow.' };
  }
  if (targetMicro < usdToMicro(MIN_GROW_USD)) {
    return {
      kind: 'too-small',
      // Below this the fees dominate the number the user is shown, which makes
      // the whole "watch it grow" premise read as a lie.
      message: `The smallest Grow is $${MIN_GROW_USD}.`,
    };
  }
  if (targetMicro > usdToMicro(MAX_GROW_USD)) {
    return {
      kind: 'too-large',
      message: `Grows are capped at $${MAX_GROW_USD} while this is a demo.`,
    };
  }
  return null;
}
