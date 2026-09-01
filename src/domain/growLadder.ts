/**
 * The two questions the Grow screen is allowed to ask: how much, and out of
 * what. This module answers both, and nothing else.
 *
 * A swap screen wants to show a quote, a route, a minimum received and a price
 * per token. None of that is a decision the user makes — it is the consequence
 * of one. So the amounts offered here are bounded by what is actually held,
 * which removes the whole class of screen where the app suggests $1 out of a
 * balance of $0.56 and only the quote knows better.
 */
import {
  ALL_RUNG_SHAVE_BPS,
  DEFAULT_GROW_USD,
  MOVED_24H_PCT,
  MAX_GROW_USD,
  MIN_GROW_USD,
  SOL_FEE_RESERVE_USD,
} from '../config/limits';
import { STABLE_MINTS, WSOL } from '../config/tokens';
import { type MicroUsd, usdToMicro } from './money';

export type AmountRung = {
  readonly micro: MicroUsd;
  /** The asset's whole spendable balance — rendered as `ALL`. */
  readonly all: boolean;
};

/** The part of a portfolio entry this module needs. */
export type LadderAsset = {
  readonly mint: string;
  readonly valueMicro: MicroUsd;
};

/** Round rungs, cheapest first. Anything past the balance never appears. */
const STEPS_USD: readonly number[] = [0.25, 0.5, 1, 2, 5, 10, 25];

const FLOOR = usdToMicro(MIN_GROW_USD);
const CEILING = usdToMicro(MAX_GROW_USD);

function subBps(micro: MicroUsd, bps: number): MicroUsd {
  return micro - Math.ceil((micro * bps) / 10_000);
}

/**
 * What an asset can actually put into a Grow.
 *
 * For everything except SOL that is the whole holding. SOL also pays the fee
 * for the transaction that spends it, so the last of it is not spendable.
 */
export function availableMicro(asset: LadderAsset): MicroUsd {
  if (asset.mint !== WSOL.mint) return asset.valueMicro;
  return Math.max(0, asset.valueMicro - usdToMicro(SOL_FEE_RESERVE_USD));
}

/**
 * The amount wheel for one asset.
 *
 * Empty when the asset cannot fund even the smallest Grow, which is the same
 * thing as "this asset is not offerable" — see `growable`.
 *
 * `seeded` is the amount Home already decided on. It is inserted as a rung of
 * its own rather than rounded to a neighbour: the screen must not silently
 * drop a choice the user made on the previous screen.
 */
export function rungsFor(available: MicroUsd, seeded: MicroUsd | null = null): readonly AmountRung[] {
  const limitedByBalance = available < CEILING;
  // The demo ceiling is a hard limit and needs no headroom; a whole balance
  // does, or the rounding in `target / price` can ask for more than is held.
  const top = limitedByBalance ? subBps(available, ALL_RUNG_SHAVE_BPS) : CEILING;
  if (!Number.isFinite(top) || top < FLOOR) return [];

  const micros = STEPS_USD.map(usdToMicro).filter((micro) => micro >= FLOOR && micro < top);
  if (seeded !== null && seeded >= FLOOR && seeded < top) micros.push(seeded);

  const rungs = [...new Set(micros)]
    .sort((a, b) => a - b)
    .map((micro) => ({ micro, all: false }));

  // `top` is excluded above, so it is always the new last rung.
  rungs.push({ micro: top, all: limitedByBalance });
  return rungs;
}

/**
 * Where the wheel opens: `min($1, whole balance)`.
 *
 * A seeded amount wins outright — the user picked it one screen ago.
 */
export function defaultRungIndex(
  rungs: readonly AmountRung[],
  seeded: MicroUsd | null = null,
): number {
  if (rungs.length === 0) return 0;

  if (seeded !== null) {
    const exact = rungs.findIndex((rung) => rung.micro === seeded);
    if (exact >= 0) return exact;
  }

  const preferred = usdToMicro(DEFAULT_GROW_USD);
  let index = 0;
  for (let i = 0; i < rungs.length; i += 1) {
    if (rungs[i].micro <= preferred) index = i;
  }
  return index;
}

/**
 * Where an asset sits in the `From` wheel.
 *
 * ⚠️ THIS USED TO BE SMALLEST FIRST — the cleanup order, on the reasoning that
 * dust is what a user parts with most easily. Rejected by the user on
 * 2026-09-02 after using it: the wheel opened on a meme coin and the whole
 * control read as a bin of leftovers rather than the place you keep money.
 *
 * Dollars first, because keeping a dollar out of dollars is the plainest thing
 * the screen can offer and the only one with no market move attached. Then SOL,
 * the one asset every Solana wallet has. Then everything else, largest first.
 *
 * A stablecoin holding too small to fund a normal Grow does not get the top
 * slot — a $0.30 USDC crumb is dust like any other, whatever it is pegged to.
 */
function sourceRank(asset: LadderAsset): number {
  if (STABLE_MINTS.has(asset.mint) && availableMicro(asset) >= usdToMicro(DEFAULT_GROW_USD)) {
    return 0;
  }
  if (asset.mint === WSOL.mint) return 1;
  return 2;
}

/** Assets with at least one rung, in the order the wheel offers them. */
export function growable<T extends LadderAsset>(assets: readonly T[]): readonly T[] {
  return assets
    .filter((asset) => rungsFor(availableMicro(asset)).length > 0)
    .sort((a, b) => sourceRank(a) - sourceRank(b) || availableMicro(b) - availableMicro(a));
}

/**
 * The asset the screen opens on.
 *
 * ⚠️ NOT simply the smallest, and the reason is worth keeping. Dust-first was
 * the original rule — dust is the holding a user is most willing to part with
 * and least likely to clear on purpose — and it is still the order of the wheel.
 * But as a DEFAULT it opened a real wallet on $0.29 of a meme coin, which is an
 * accident of that wallet rather than a decision, and a rule has to give the
 * same kind of answer on anyone's.
 *
 * It is simply the FIRST asset in the wheel's own order that can fund a normal
 * Grow — dollars, then SOL, then the largest of the rest. The order already
 * encodes the preference, so the default cannot drift away from what the user
 * sees under it.
 *
 * When nothing can fund a normal Grow, the largest holding there is. Dust stays
 * offerable throughout — it is just never what the screen opens on.
 */
export function defaultAsset<T extends LadderAsset>(assets: readonly T[]): T | null {
  const offerable = growable(assets);
  if (offerable.length === 0) return null;

  const normal = offerable.find(
    (asset) => availableMicro(asset) >= usdToMicro(DEFAULT_GROW_USD),
  );
  if (normal) return normal;

  return [...offerable].sort((a, b) => availableMicro(b) - availableMicro(a))[0];
}

/** Whether a fall is worth saying something about before selling into it. */
export function isFalling(change24hPct: number): boolean {
  return Number.isFinite(change24hPct) && change24hPct <= -MOVED_24H_PCT;
}

/** Whether a rise is worth pointing at as a reason to keep some of it. */
export function isRising(change24hPct: number): boolean {
  return Number.isFinite(change24hPct) && change24hPct >= MOVED_24H_PCT;
}
