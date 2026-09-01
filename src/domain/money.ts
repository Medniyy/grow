/**
 * Money. All internal amounts are INTEGERS — never floats.
 *
 * USD is carried as integer micro-dollars (1e-6), which is exactly USDC's
 * precision, so a USDC atomic amount and a micro-USD amount are the same number
 * and no conversion can drift. Floats are only ever produced at the display edge.
 */

export const USDC_DECIMALS = 6;

/** Integer micro-dollars. 1_000_000 === $1.00. */
export type MicroUsd = number;

const MAX_DECIMALS = 18;

/**
 * UI amount -> atomic units.
 *
 * The single most common DFlow error is `route_not_found`, and it is almost
 * always an amount passed in UI units instead of atomic ones. This helper
 * exists so that math is never inlined at a call site.
 *
 * Goes through a fixed-point string rather than `ui * 10 ** decimals`, because
 * the float form produces 1.1 * 1e6 === 1100000.0000000001 and similar.
 */
export function toAtomic(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui)) throw new Error(`toAtomic: amount is not finite (${ui})`);
  if (ui < 0) throw new Error(`toAtomic: amount is negative (${ui})`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new Error(`toAtomic: bad decimals (${decimals})`);
  }
  const [whole, frac = ''] = ui.toFixed(decimals).split('.');
  return BigInt(whole + frac.padEnd(decimals, '0'));
}

/** Atomic units -> UI number. Display only — never feed this back into math. */
export function fromAtomic(atomic: bigint, decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new Error(`fromAtomic: bad decimals (${decimals})`);
  }
  return Number(atomic) / 10 ** decimals;
}

/** Dollars -> integer micro-dollars. */
export function usdToMicro(usd: number): MicroUsd {
  return Number(toAtomic(usd, USDC_DECIMALS));
}

/** Integer micro-dollars -> dollars. Display only. */
export function microToUsd(micro: MicroUsd): number {
  return micro / 10 ** USDC_DECIMALS;
}

/**
 * `$847`, `$4.21`, `$0.79` — SPEC §28: money is the protagonist and must be
 * instantly readable. Whole dollars drop the cents; anything else keeps two.
 * Sub-cent precision is never shown, only carried.
 */
export function formatUsd(micro: MicroUsd): string {
  const usd = microToUsd(micro);
  const whole = Math.abs(usd % 1) < 1e-9;
  return `$${usd.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

/** Basis points applied to an integer amount, rounded up so a pad never under-pads. */
export function addBps(micro: MicroUsd, bps: number): MicroUsd {
  if (!Number.isInteger(micro)) throw new Error('addBps: micro must be an integer');
  return micro + Math.ceil((micro * bps) / 10_000);
}
