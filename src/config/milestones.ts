/**
 * The progression ladder — SPEC §9.
 *
 * Editable configuration, never hard-coded across the app. Everything that needs
 * a milestone reads it from here.
 *
 * `id` is STABLE and is the only join key. Per Q15, milestones never re-lock —
 * unlocks are stored against `id`, so editing a threshold later cannot take an
 * earned unlock away from anyone.
 */

export type Milestone = {
  /** Stable identity. Never reuse, never renumber, never join on threshold. */
  readonly id: string;
  readonly label: string;
  /** USD of *grown* (the ledger total), not wallet holdings. See Q1. */
  readonly thresholdUsd: number;
};

export const MILESTONES: readonly Milestone[] = [
  { id: 'started', label: 'Started', thresholdUsd: 0 },
  { id: 'coffee', label: 'Coffee', thresholdUsd: 1 },
  { id: 'cola', label: 'Cola', thresholdUsd: 2 },
  { id: 'meal', label: 'Meal', thresholdUsd: 5 },
  { id: 'movie', label: 'Movie', thresholdUsd: 10 },
  { id: 'tshirt', label: 'T-shirt', thresholdUsd: 25 },
  { id: 'dinner', label: 'Dinner', thresholdUsd: 50 },
  { id: 'headphones', label: 'Headphones', thresholdUsd: 100 },
  { id: 'airpods', label: 'AirPods', thresholdUsd: 250 },
  { id: 'console', label: 'Console', thresholdUsd: 500 },
  { id: 'iphone', label: 'iPhone', thresholdUsd: 1199 },
  { id: 'macbook', label: 'MacBook', thresholdUsd: 2000 },
  { id: 'trip', label: 'Trip', thresholdUsd: 3000 },
  { id: 'month-free', label: 'One Month Free', thresholdUsd: 5000 },
  { id: 'serious-stack', label: 'Serious Stack', thresholdUsd: 10000 },
] as const;

/**
 * The free seed (M1). Awarded at wallet connect, emits no social event, and is
 * excluded from `grown` — a verified badge on a $0 achievement would devalue
 * every real one.
 */
export const STARTED_MILESTONE_ID = 'started';
