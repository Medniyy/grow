import { MILESTONES, type Milestone } from '../config/milestones';
import { grownMicro } from './ledger';
import type { GrowAction } from './growAction';
import { type MicroUsd, usdToMicro } from './money';

export type Progress = {
  readonly grown: MicroUsd;
  /** Everything earned. Persisted ∪ derived — see `unlockedIds` below. */
  readonly unlockedIds: readonly string[];
  /** Highest milestone reached. Null only if the ladder is empty. */
  readonly current: Milestone | null;
  /** SPEC §9: exactly ONE primary next unlock. Null when the ladder is finished. */
  readonly next: Milestone | null;
  /** Distance to `next`. Zero when finished. */
  readonly remaining: MicroUsd;
  /** 0..1 against `next`'s threshold — SPEC §10 shows `$4.21 / $5`. */
  readonly percentToNext: number;
};

const byThreshold = (a: Milestone, b: Milestone) => a.thresholdUsd - b.thresholdUsd;

/** The ladder in ascending order. Config order is not trusted. */
export function ladder(): readonly Milestone[] {
  return [...MILESTONES].sort(byThreshold);
}

export function milestoneById(id: string): Milestone | undefined {
  return MILESTONES.find((m) => m.id === id);
}

/**
 * Which milestones the current total has crossed.
 *
 * Q15 — milestones NEVER re-lock. Callers pass what has already been persisted
 * and it is unioned in, so neither a falling total nor an edited threshold can
 * take an earned unlock away. The join is on stable `id`, never on threshold.
 */
export function unlockedIds(
  grown: MicroUsd,
  persisted: readonly string[] = [],
): readonly string[] {
  const earned = new Set(persisted);
  for (const m of ladder()) {
    if (grown >= usdToMicro(m.thresholdUsd)) earned.add(m.id);
  }
  // Return in ladder order so the UI never has to sort.
  const order = ladder().map((m) => m.id);
  const known = order.filter((id) => earned.has(id));
  // Ids no longer in the ladder are still earned; keep them at the end.
  const orphaned = [...earned].filter((id) => !order.includes(id));
  return [...known, ...orphaned];
}

/**
 * Q4 — unlocks are derived from the RESULTING TOTAL, never from a delta.
 * "We just crossed $5" is order-dependent and double-fires on retry; asking
 * "what does $5 unlock that isn't already persisted" is idempotent by construction.
 */
export function newUnlockIds(grown: MicroUsd, persisted: readonly string[]): readonly string[] {
  const already = new Set(persisted);
  return unlockedIds(grown, persisted).filter((id) => !already.has(id));
}

/**
 * Multi-unlock: a single Grow can cross several thresholds at once. SPEC §30
 * animates the highest one rather than replaying the moment several times.
 */
export function highestOf(ids: readonly string[]): Milestone | null {
  const found = ids.map(milestoneById).filter((m): m is Milestone => m !== undefined);
  if (found.length === 0) return null;
  return found.reduce((a, b) => (b.thresholdUsd > a.thresholdUsd ? b : a));
}

export function computeProgress(
  grown: MicroUsd,
  persisted: readonly string[] = [],
): Progress {
  const rungs = ladder();
  const earned = unlockedIds(grown, persisted);

  const reached = rungs.filter((m) => grown >= usdToMicro(m.thresholdUsd));
  const current = reached.length > 0 ? reached[reached.length - 1] : null;
  const next = rungs.find((m) => usdToMicro(m.thresholdUsd) > grown) ?? null;

  if (next === null) {
    return { grown, unlockedIds: earned, current, next: null, remaining: 0, percentToNext: 1 };
  }

  const target = usdToMicro(next.thresholdUsd);
  return {
    grown,
    unlockedIds: earned,
    current,
    next,
    remaining: Math.max(0, target - grown),
    percentToNext: target === 0 ? 1 : Math.min(1, grown / target),
  };
}

/** Convenience: ledger -> progress in one call. */
export function progressFromActions(
  actions: readonly GrowAction[],
  persisted: readonly string[] = [],
): Progress {
  return computeProgress(grownMicro(actions), persisted);
}

/** The horizon the user chose, and how far along it they are. */
export type GoalProgress = {
  readonly milestone: Milestone;
  readonly remaining: MicroUsd;
  /** 0..1 of the way there. */
  readonly percent: number;
  readonly reached: boolean;
};

/**
 * Where the chosen goal stands.
 *
 * ⚠️ THE GOAL HAS TO BE VISIBLE SOMEWHERE. It was asked for after the first
 * unlock, stored, and then read exactly once — to decide whether to ask again.
 * Picking `iPhone` changed nothing on any screen, which makes the question a
 * survey rather than a commitment.
 *
 * It is not the same thing as `next`. `next` is the rung arriving soon and it
 * moves every few dollars; the goal is the horizon that stays put through
 * twenty of them, which is exactly what a ladder with $500-to-$1,199 gaps needs
 * on the days when nothing is about to unlock.
 *
 * Null when nothing was chosen — never a default. A goal the app picked is not
 * a goal.
 */
export function goalProgress(grown: MicroUsd, goalId: string | null): GoalProgress | null {
  if (!goalId) return null;
  const milestone = milestoneById(goalId);
  if (!milestone) return null;

  const target = usdToMicro(milestone.thresholdUsd);
  if (target <= 0) return null;

  return {
    milestone,
    remaining: Math.max(0, target - grown),
    percent: Math.min(1, grown / target),
    reached: grown >= target,
  };
}

/**
 * Percent moments inside the current rung.
 *
 * The ladder starves in the middle: $1 -> $2 -> $5 arrives constantly, but
 * $500 -> $1,199 is weeks of silence, exactly when the user has the most
 * invested. These turn one distant goal into four arrivals.
 *
 * SPEC §17 already defines 25/50/75/90 as social-event thresholds; the same
 * marks work as private moments with no feed attached.
 */
export const PERCENT_MARKS: readonly number[] = [25, 50, 75, 90];

/**
 * Which marks a Grow crossed. Takes the totals BEFORE and AFTER, so a mark can
 * only ever fire on the move that actually crossed it — replaying the same
 * confirmation reports nothing, exactly as unlocks behave (Q4).
 */
export function crossedPercentMarks(
  grownBefore: MicroUsd,
  grownAfter: MicroUsd,
  target: Milestone | null,
): readonly number[] {
  if (!target || target.thresholdUsd <= 0) return [];
  const threshold = usdToMicro(target.thresholdUsd);
  if (threshold <= 0) return [];

  const before = (grownBefore / threshold) * 100;
  const after = (grownAfter / threshold) * 100;

  // A mark at 100 would collide with the unlock itself, which owns that moment.
  return PERCENT_MARKS.filter((mark) => before < mark && after >= mark && after < 100);
}
