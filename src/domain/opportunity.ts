/**
 * The Opportunity Engine — the answer to "why open Grow today?"
 *
 * A savings app has a structural news problem (PRODUCT-LOOP §1): if the user
 * does not add money, nothing happens, so reminders degrade into asking for
 * money while delivering nothing. The engine's job is to find the ONE most
 * natural reason to keep a little money right now, from state the user did not
 * have to create.
 *
 * Deliberately pure and free of React, network and clock reads — every input is
 * a parameter. A wrong opportunity is a lie told at the most persuasive moment
 * in the product, so this has to be testable at every boundary.
 *
 * ⚠️ MARKET GAIN IS ONE TRIGGER, NOT THE ENGINE. Roughly half of all days are
 * red, and an engine that only speaks when the market is up is silent exactly
 * when a saver most needs a reason to keep. Every branch here therefore ends in
 * an amount the user can act on.
 *
 * ⚠️ AND IT NEVER EDITORIALISES INSTEAD OF OFFERING. There used to be a fourth
 * branch, `steady`, which answered a red day by saying so and deliberately
 * asking for nothing. Tested, it read as a wall: the standard menu vanished and
 * the one thing the user came to do — put a little away — was replaced by a
 * remark about the market, on every load, with no way past it. A red day is not
 * a reason to stop offering. What a falling asset does deserve is a warning at
 * the moment it is about to be SOLD, which is the Grow screen's job, not this
 * one's — and there it names the position rather than "the market".
 */
import { MIN_GROW_USD } from '../config/limits';
import { USDC } from '../config/tokens';
import type { Milestone } from '../config/milestones';
import { paddedTarget } from './growPlan';
import { type MicroUsd, usdToMicro } from './money';

export type OpportunityKind = 'milestone' | 'gain' | 'routine';

export type Opportunity = {
  readonly kind: OpportunityKind;
  /** The line that owns the screen. */
  readonly headline: string;
  /** One supporting line. Never a second idea. */
  readonly body: string;
  /** Label for the primary action. */
  readonly cta: string;
  /**
   * Suggested amounts, cheapest first. Never empty: every opportunity this
   * engine returns is something the user can act on.
   */
  readonly amounts: readonly MicroUsd[];
  /** Mint the opportunity is about, when it is about one. */
  readonly mint: string | null;
};

export type OpportunityHolding = {
  readonly mint: string;
  readonly name: string;
  readonly valueMicro: MicroUsd;
  /** 24h move as a PERCENT (2.28 = +2.28%). */
  readonly change24hPct: number;
};

export type OpportunityInput = {
  readonly grown: MicroUsd;
  readonly next: Milestone | null;
  readonly remaining: MicroUsd;
  readonly holdings: readonly OpportunityHolding[];
};

/** Below this a "you're up" line is noise dressed as news. */
const MIN_GAIN_MICRO = usdToMicro(0.5);

/** A milestone this close is more compelling than anything the market did. */
const FINISHABLE_MICRO = usdToMicro(5);

/** Standard offers when nothing about today suggests a number. */
const ROUTINE_AMOUNTS: readonly MicroUsd[] = [usdToMicro(1), usdToMicro(3), usdToMicro(5)];

const MIN_MICRO = usdToMicro(MIN_GROW_USD);

function formatUsdShort(micro: MicroUsd): string {
  const usd = micro / 1_000_000;
  return usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`;
}

/**
 * What a holding is worth more (or less) than 24h ago.
 *
 * The current value already INCLUDES the move, so the previous value is
 * `value / (1 + pct/100)` and the delta is the difference. Multiplying the
 * current value by the percentage would overstate every gain.
 */
export function dailyDeltaMicro(holding: OpportunityHolding): MicroUsd {
  const factor = 1 + holding.change24hPct / 100;
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  const previous = holding.valueMicro / factor;
  return Math.round(holding.valueMicro - previous);
}

/**
 * The portfolio's move over 24h, and the single holding that moved up most.
 *
 * ⚠️ DOLLARS DO NOT VOTE. A stablecoin's 24h "move" is peg noise, not news —
 * Jupiter reports USDC at -0.0138%, which is a dollar being a dollar. It became
 * a source you can Grow FROM, and it arrived in this list with it; on a wallet
 * holding $664 of USDC against a few dollars of everything else, ±$0.09 of
 * measurement jitter would decide whether the app announces "Market's down".
 * It is still a perfectly good thing to Grow from — it is just not weather.
 */
export function dailyMovement(holdings: readonly OpportunityHolding[]): {
  totalMicro: MicroUsd;
  leader: OpportunityHolding | null;
} {
  let totalMicro = 0;
  let leader: OpportunityHolding | null = null;
  let best = 0;

  for (const holding of holdings) {
    if (holding.mint === USDC.mint) continue;
    const delta = dailyDeltaMicro(holding);
    totalMicro += delta;
    if (delta > best) {
      best = delta;
      leader = holding;
    }
  }
  return { totalMicro, leader };
}

/**
 * No offer may fall below the floor where fees dominate the number shown.
 *
 * ⚠️ Load-bearing. A gap of two tenths of a cent to the next milestone produced
 * a button reading `Finish it $0.00` — an ask for nothing, rounded into
 * existence by two-decimal formatting. Every amount leaving this module passes
 * through here.
 */
function atLeastFloor(amounts: readonly MicroUsd[]): readonly MicroUsd[] {
  return [...new Set(amounts.map((a) => Math.max(MIN_MICRO, a)))].sort((a, b) => a - b);
}

/**
 * Round numbers at or below a ceiling, so the ask is always a fraction of what
 * actually happened rather than a number invented by the app.
 */
function amountsUpTo(ceilingMicro: MicroUsd): readonly MicroUsd[] {
  const offers = ROUTINE_AMOUNTS.filter((a) => a <= ceilingMicro);
  // Never offer nothing: if the move was tiny, the smallest honest ask stands.
  return atLeastFloor(offers.length > 0 ? offers : [MIN_MICRO]);
}

/**
 * Which holding an offer should come OUT OF.
 *
 * ⚠️ Dollars first, and it is not a preference — it is what stops the card
 * asking for money the source does not have. The old rule took the day's
 * biggest riser, which on a real wallet was a $0.29 meme coin against a $1.00
 * gap: the card offered "Finish it $1.02" out of an asset holding thirty cents,
 * and the Grow screen then had to quietly drop the amount it was handed.
 *
 * Dollars are also the only source with no slippage to pad against, so this is
 * what turns `$1.02` back into `$1.00` — see the pad exception below.
 *
 * Falls back to the day's leader, then to the largest holding that can cover
 * the ask, then to whatever is there, so the card is never empty.
 */
function sourceFor(
  holdings: readonly OpportunityHolding[],
  neededMicro: MicroUsd,
): OpportunityHolding | null {
  const covers = (holding: OpportunityHolding) => holding.valueMicro >= neededMicro;

  const usdc = holdings.find((holding) => holding.mint === USDC.mint);
  if (usdc && covers(usdc)) return usdc;

  const { leader } = dailyMovement(holdings);
  if (leader && covers(leader)) return leader;

  const biggest = [...holdings].sort((a, b) => b.valueMicro - a.valueMicro)[0];
  return biggest ?? null;
}

/**
 * Pick the one opportunity to show.
 *
 * Order is the product decision, not an implementation detail:
 *
 * 1. `milestone` — a nearly-finished unlock beats anything the market did. It is
 *    the only trigger where the user can *complete* something today.
 * 2. `gain` — real money appeared without the user doing anything, which is the
 *    easiest dollar anyone ever saves.
 * 3. `routine` — no signal, or a red one. Say so plainly rather than
 *    manufacturing urgency, and still offer the standard amounts: a day the
 *    market fell is not a day to take the menu away.
 */
export function pickOpportunity(input: OpportunityInput): Opportunity {
  const { next, remaining, holdings } = input;
  const { totalMicro, leader } = dailyMovement(holdings);

  if (next && remaining > 0 && remaining <= FINISHABLE_MICRO) {
    const source = sourceFor(holdings, remaining);
    // A gap smaller than a cent cannot be stated in dollars without reading as
    // zero, and it cannot be closed exactly anyway — the smallest allowed Grow
    // overshoots it. So say what is true instead of printing "$0.00 to unlock".
    const belowACent = remaining < usdToMicro(0.01);
    return {
      kind: 'milestone',
      headline: 'Almost there.',
      body: belowACent
        ? `One more Grow unlocks ${next.label}.`
        : `${formatUsdShort(remaining)} to unlock ${next.label}.`,
      cta: 'Finish it',
      /**
       * Padded so the GUARANTEED floor clears the gap — Q2. An unlock is only
       * ever promised against `minOutAmount`, never against an estimate.
       *
       * EXCEPT out of dollars, where there is no floor to protect. The pad buys
       * headroom against swap slippage; a USDC Grow is a transfer, out equals
       * in exactly, and padding it asks $1.02 to close a $1.00 gap for no
       * reason anyone could explain.
       */
      amounts: atLeastFloor([
        source?.mint === USDC.mint ? remaining : paddedTarget(remaining),
      ]),
      mint: source?.mint ?? null,
    };
  }

  if (totalMicro >= MIN_GAIN_MICRO && leader) {
    return {
      kind: 'gain',
      headline: `You're up ${formatUsdShort(totalMicro)} today.`,
      body: `Keep some of it before it moves again.`,
      cta: 'Grow',
      amounts: amountsUpTo(totalMicro),
      mint: leader.mint,
    };
  }

  // `holdings` arrives smallest first (the cleanup order), so taking the first
  // entry seeded the standard $1 offer out of the dustiest thing in the wallet.
  const source = sourceFor(holdings, ROUTINE_AMOUNTS[0]);
  return {
    kind: 'routine',
    headline: 'Keep a little today?',
    body: next ? `${formatUsdShort(remaining)} to ${next.label}.` : 'Any amount counts.',
    cta: 'Grow',
    amounts: atLeastFloor(ROUTINE_AMOUNTS),
    mint: source?.mint ?? null,
  };
}
