/**
 * How much of a Grow goes to work — the one question the supply screen asks.
 *
 * Deliberately a separate ladder from `growLadder`, not a parameter on it. The
 * two answer different questions out of different money: a Grow spends a wallet
 * holding and is capped at `MAX_GROW_USD` because it is a demo spend limit on
 * real funds, while this moves dollars that are ALREADY saved and has no reason
 * to be capped at $25 — capping it there would tell someone with $400 kept that
 * they may put $25 of it to work and leave the rest idle for no stated reason.
 */
import { type AmountRung } from './growLadder';
import { type MicroUsd, usdToMicro } from './money';

/**
 * The smallest supply worth making.
 *
 * Not a protocol limit — Kamino would take a cent. It is an honesty limit: the
 * deposit costs a Solana fee, and below a dollar the first year of interest does
 * not pay for the transaction that started it. Offering a rung that loses money
 * would make the whole screen a lie told in small print.
 */
export const MIN_SUPPLY_USD = 1;

/** Round rungs, smallest first. Anything past the balance never appears. */
const STEPS_USD: readonly number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const FLOOR = usdToMicro(MIN_SUPPLY_USD);

/**
 * The amount wheel for a Grow Account balance.
 *
 * ⚠️ NO SHAVE ON THE `ALL` RUNG, unlike `rungsFor`. That one trims a few basis
 * points because a swap's rounding can ask for fractionally more of a holding
 * than is held. A supply is not a swap: the exact number of USDC units in the
 * account is the number deposited, there is no price and nothing to slip, and
 * the fee is paid in SOL from a different balance entirely.
 *
 * Empty when the balance cannot fund even the smallest supply, which is the
 * same thing as "there is nothing to offer here".
 */
export function supplyRungs(kept: MicroUsd): readonly AmountRung[] {
  if (!Number.isFinite(kept) || kept < FLOOR) return [];

  const micros = STEPS_USD.map(usdToMicro).filter((micro) => micro >= FLOOR && micro < kept);
  const rungs = micros.map((micro) => ({ micro, all: false }));

  // `kept` is excluded above, so the whole balance is always the last rung.
  rungs.push({ micro: kept, all: true });
  return rungs;
}

/**
 * Where the wheel opens: the largest rung at or under half the balance.
 *
 * ⚠️ NOT `ALL`, and not the smallest either. Opening on the whole balance makes
 * the default answer "hand everything to a third-party lending protocol", which
 * is not a default an app gets to choose on someone's behalf on the same screen
 * as a paragraph about shared losses. Opening on $1 out of $400 is the opposite
 * failure — a control that treats a real decision as a toe in the water.
 *
 * Half is the shape of a first supply: enough to be worth doing, and something
 * kept back. It scales with the balance instead of being a fixed dollar figure
 * that reads as generous at $25 and absurd at $4,000.
 */
export function defaultSupplyIndex(rungs: readonly AmountRung[]): number {
  if (rungs.length === 0) return 0;

  const half = rungs[rungs.length - 1].micro / 2;
  let index = 0;
  for (let i = 0; i < rungs.length; i += 1) {
    if (rungs[i].micro <= half) index = i;
  }
  return index;
}
