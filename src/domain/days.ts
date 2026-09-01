/**
 * How long this Grow has been going.
 *
 * The one number in the product that rises without the user spending anything,
 * which is exactly why it belongs on Home: a savings app has a structural news
 * problem — if no money goes in, nothing happens — and a figure that grows on
 * its own gives an honest reason to come back on a day with nothing to add.
 *
 * Counted in CALENDAR days, not 24-hour blocks. "Started yesterday" reads as day
 * two to a person even if only forty minutes have passed, and the counter has to
 * agree with the way people speak about it or it feels broken.
 *
 * Pure and clock-free — `now` is a parameter — because this ends up on a share
 * card, and a number other people see has to be reproducible in a test.
 */
import type { GrowAction } from './growAction';

const DAY_MS = 86_400_000;

/**
 * When the CURRENT Grow started.
 *
 * ⚠️ NOT THE SAME AS WHEN THE ACCOUNT WAS OPENED. The Grow Account's first
 * transaction is fixed on chain forever — withdrawing everything does not move
 * it — so counting from there kept the clock running through a closure and told
 * someone who had just started over that they were on day five. The account is
 * the address; the Grow is what is currently growing in it.
 *
 * The earliest confirmed action is that start, and closing a Grow clears the
 * ledger, so the next deposit becomes day one on its own with nothing extra to
 * remember.
 *
 * Falls back to the account's own age when the ledger has no confirmed rows:
 * either nothing has been grown yet, or local storage was cleared and the money
 * is still on chain. Over-reporting there is the lesser wrong — the alternative
 * is telling a two-week saver they started today.
 */
export function growStartedAt(
  actions: readonly GrowAction[],
  accountOpenedAtMs: number | null,
): number | null {
  let earliest: number | null = null;
  for (const action of actions) {
    if (action.status !== 'confirmed') continue;
    if (earliest === null || action.createdAt < earliest) earliest = action.createdAt;
  }
  return earliest ?? accountOpenedAtMs;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Whole days since the Grow was opened, where the opening day is day 1.
 *
 * Null when the opening date is unknown — an unopened account, or a chain read
 * that has not answered. Never zero and never a guess: the caller has to be able
 * to tell "no Grow yet" from "day one", and rendering a placeholder day count is
 * how a demo ends up publishing a number nobody earned.
 */
export function daysGrowing(openedAtMs: number | null, nowMs: number): number | null {
  if (openedAtMs == null || !Number.isFinite(openedAtMs)) return null;

  // A clock behind the chain would otherwise produce day zero, or a negative.
  if (nowMs <= openedAtMs) return 1;

  // Rounded, not floored: a day containing a daylight-saving change is 23 or 25
  // hours long, and dividing those by 24 drops or invents a day.
  const elapsed = startOfLocalDay(nowMs) - startOfLocalDay(openedAtMs);
  return Math.max(1, Math.round(elapsed / DAY_MS) + 1);
}

/** `1 day` / `13 days`. The plural is not worth a library. */
export function formatDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`;
}
