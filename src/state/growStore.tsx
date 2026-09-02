import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { DEMO_ACTIONS } from '../config/demo';
import { env } from '../config/env';
// The ids live beside the copy they name, in `config/hints.ts`. Re-exported
// here because the store is where every consumer already reaches for them.
import type { HintId } from '../config/hints';
import { STARTED_MILESTONE_ID } from '../config/milestones';
import type { GrowAction } from '../domain/growAction';
import { grownMicro, recoveredMicro, upsertAction } from '../domain/ledger';
import type { MicroUsd } from '../domain/money';
import { computeProgress, newUnlockIds, unlockedIds, type Progress } from '../domain/progress';
import { defaultHandle } from '../lib/identity';
import { clearProgressFor, keyFor, readJson, writeJson } from '../lib/storage/store';
import { useWallet } from '../lib/wallet';
import { useGrowAccount } from './growAccount';

export type { HintId };


type GrowState = {
  readonly loading: boolean;
  readonly pubkey: string | null;
  readonly handle: string | null;
  readonly actions: readonly GrowAction[];
  /** Persisted unlocks. Q15: the union with derived ones is what the UI shows. */
  readonly unlocked: readonly string[];
  readonly grown: MicroUsd;
  readonly progress: Progress;

  /** False until the first-run sequence has played for this wallet. */
  readonly onboarded: boolean;
  readonly seenHints: readonly HintId[];
  /** The milestone the user chose to aim at. Null until they are asked. */
  readonly goalMilestoneId: string | null;
  /**
   * When this Grow was last started over, or null if it never has been.
   *
   * The day counter needs it: a closure clears the ledger, and without this the
   * count falls back to the ACCOUNT's age, which a closure does not move.
   */
  readonly restartedAt: number | null;

  recordAction(action: GrowAction): Promise<readonly string[]>;
  setHandle(next: string): Promise<void>;
  completeOnboarding(): Promise<void>;
  replayOnboarding(): Promise<void>;
  markHintSeen(hint: HintId): Promise<void>;
  setGoal(milestoneId: string | null): Promise<void>;
  /** Wipes everything this Grow earned. The money is moved separately. */
  closeGrow(): Promise<void>;
};

const GrowContext = createContext<GrowState | null>(null);

export function GrowProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const pubkey = wallet.publicKey;
  // Why this provider sits INSIDE GrowAccountProvider: the on-chain balance is
  // the floor under the total, so it has to resolve first.
  const { kept } = useGrowAccount();

  const [loading, setLoading] = useState(true);
  const [handle, setHandleState] = useState<string | null>(null);
  const [actions, setActions] = useState<readonly GrowAction[]>([]);
  const [unlocked, setUnlocked] = useState<readonly string[]>([]);
  const [onboarded, setOnboarded] = useState(false);
  const [seenHints, setSeenHints] = useState<readonly HintId[]>([]);
  const [goalMilestoneId, setGoalState] = useState<string | null>(null);
  const [restartedAt, setRestartedAt] = useState<number | null>(null);

  // Reload from scratch whenever the identity changes. Reads are keyed by
  // pubkey, so a wallet switch can never surface the previous wallet's Grow.
  useEffect(() => {
    let cancelled = false;

    if (!pubkey) {
      setActions([]);
      setUnlocked([]);
      setHandleState(null);
      setOnboarded(false);
      setSeenHints([]);
      setGoalState(null);
      setRestartedAt(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      const [
        storedActions,
        storedUnlocks,
        storedHandle,
        storedFlags,
        storedGoal,
        storedRecovered,
        storedRestartedAt,
      ] =
        await Promise.all([
          readJson<GrowAction[]>(keyFor(pubkey, 'actions'), []),
          readJson<string[]>(keyFor(pubkey, 'unlocks'), []),
          readJson<string | null>(keyFor(pubkey, 'handle'), null),
          readJson<{ onboarded: boolean; hints: HintId[] }>(keyFor(pubkey, 'hints'), {
            onboarded: false,
            hints: [],
          }),
          readJson<string | null>(keyFor(pubkey, 'goal'), null),
          readJson<number>(keyFor(pubkey, 'recovered'), 0),
          readJson<number | null>(keyFor(pubkey, 'restarted'), null),
        ]);
      if (cancelled) return;

      // M1 — the free Started seed is awarded at wallet connect. It emits no
      // social event and contributes nothing to `grown`: a verified badge on a
      // $0 achievement would devalue every real one.
      const withStarted = storedUnlocks.includes(STARTED_MILESTONE_ID)
        ? storedUnlocks
        : [STARTED_MILESTONE_ID, ...storedUnlocks];

      // Demo Mode seeds the LOCAL ledger only, and only for a wallet with no
      // real history — it must never overwrite anything a user actually grew.
      const actionsToUse =
        env.demoMode && storedActions.length === 0 ? [...DEMO_ACTIONS] : storedActions;

      setActions(actionsToUse);
      setUnlocked(withStarted);
      setHandleState(storedHandle ?? defaultHandle(pubkey));
      setOnboarded(storedFlags.onboarded);
      setSeenHints(storedFlags.hints ?? []);
      setGoalState(storedGoal);
      setRestartedAt(storedRestartedAt);
      // Known BEFORE the chain answers, so the total is right on the first
      // paint. Without it the screen opened on the ledger-only figure and then
      // jumped — $3.70 becoming $5.27 a moment later, which reads as money
      // appearing from nowhere on every single load.
      setRecovered({ owner: pubkey, micro: storedRecovered });
      setLoading(false);

      if (withStarted !== storedUnlocks) {
        await writeJson(keyFor(pubkey, 'unlocks'), withStarted);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  const ledger = useMemo(() => grownMicro(actions), [actions]);

  /**
   * How much of the total this device did not remember, measured ONCE.
   *
   * Keyed by owner so it cannot leak across a wallet switch, and pinned as soon
   * as the ledger has loaded and the chain has answered. Recomputing it on every
   * `kept` change is the bug this replaced — see `recoveredMicro`.
   */
  const [recovered, setRecovered] = useState<{ owner: string; micro: MicroUsd } | null>(null);
  const recoveredForOwner = recovered?.owner === pubkey ? recovered.micro : 0;

  const pinnedFrom = useRef<string | null>(null);
  useEffect(() => {
    // `kept === null` means the read failed or has not happened. Re-pinning
    // zero then would make a wiped ledger look empty for this session.
    if (!pubkey || loading || kept === null) return;
    if (pinnedFrom.current === pubkey) return;
    pinnedFrom.current = pubkey;

    // Measured once per session against the chain, then remembered — so the
    // next load already knows it and nothing jumps. The stored figure is passed
    // in because the answer may only ever grow — see `recoveredMicro`.
    const micro = recoveredMicro(ledger, kept, recoveredForOwner);
    if (micro === recoveredForOwner) return;
    setRecovered({ owner: pubkey, micro });
    void writeJson(keyFor(pubkey, 'recovered'), micro);
  }, [pubkey, loading, kept, ledger, recoveredForOwner]);

  const grown = ledger + recoveredForOwner;
  const progress = useMemo(() => computeProgress(grown, unlocked), [grown, unlocked]);

  /**
   * A recovered total earns back the milestones it already passed.
   *
   * `computeProgress` unions the derived unlocks in for display, so Collection
   * looks right without this. Persisting matters for the NEXT Grow: without it
   * `newUnlockIds` runs against an empty stored set and celebrates Coffee, Snack
   * and Meal all over again for someone who cleared those weeks ago.
   *
   * Silent on purpose — these were earned before, not now, so nothing animates.
   */
  useEffect(() => {
    if (!pubkey || loading) return;
    const earned = unlockedIds(grown, unlocked);
    // `earned` is always a superset of `unlocked`, so a length match means equal.
    if (earned.length === unlocked.length) return;
    setUnlocked(earned);
    void writeJson(keyFor(pubkey, 'unlocks'), earned);
  }, [grown, loading, pubkey, unlocked]);

  /**
   * Writes one Grow and returns the milestones it newly unlocked, so the caller
   * can drive the celebration. Q4: unlocks are derived from the resulting total,
   * which makes a replayed confirmation a silent no-op rather than a second
   * unlock animation.
   */
  const recordAction = useCallback(
    async (action: GrowAction) => {
      if (!pubkey) throw new Error('recordAction: no wallet connected');

      const nextActions = upsertAction(actions, action);
      // The same total the screen shows, and EXACT the instant this is called —
      // the recovered part is a pinned constant, so the new row moves the sum by
      // precisely what it added. Still derived from the resulting total rather
      // than a delta, so a replayed confirmation stays a no-op (Q4).
      const nextGrown = grownMicro(nextActions) + recoveredForOwner;
      const fresh = newUnlockIds(nextGrown, unlocked);
      const nextUnlocked = fresh.length > 0 ? [...unlocked, ...fresh] : unlocked;

      setActions(nextActions);
      if (fresh.length > 0) setUnlocked(nextUnlocked);

      await writeJson(keyFor(pubkey, 'actions'), nextActions);
      if (fresh.length > 0) await writeJson(keyFor(pubkey, 'unlocks'), nextUnlocked);

      return fresh;
    },
    [actions, pubkey, recoveredForOwner, unlocked],
  );

  const setHandle = useCallback(
    async (next: string) => {
      if (!pubkey) return;
      setHandleState(next);
      await writeJson(keyFor(pubkey, 'handle'), next);
    },
    [pubkey],
  );

  const persistFlags = useCallback(
    async (nextOnboarded: boolean, nextHints: readonly HintId[]) => {
      if (!pubkey) return;
      await writeJson(keyFor(pubkey, 'hints'), { onboarded: nextOnboarded, hints: nextHints });
    },
    [pubkey],
  );

  const completeOnboarding = useCallback(async () => {
    setOnboarded(true);
    await persistFlags(true, seenHints);
  }, [persistFlags, seenHints]);

  const replayOnboarding = useCallback(async () => {
    setOnboarded(false);
    await persistFlags(false, seenHints);
  }, [persistFlags, seenHints]);

  const markHintSeen = useCallback(
    async (hint: HintId) => {
      if (seenHints.includes(hint)) return;
      const next = [...seenHints, hint];
      setSeenHints(next);
      await persistFlags(onboarded, next);
    },
    [onboarded, persistFlags, seenHints],
  );

  /**
   * Closing a Grow starts the ladder over.
   *
   * ⚠️ THIS IS THE ONE PLACE MILESTONES RE-LOCK, and it is a deliberate
   * exception to Q15. That rule exists so a FALLING TOTAL can never take an
   * earned unlock away — a withdrawal, an edited threshold, a drifting balance.
   * None of those are this. This is the user saying they are done, with a
   * confirmation, and leaving Coffee and Meal marked earned above an empty
   * ladder would describe a Grow that no longer exists.
   *
   * Progress only. The handle, the first-run flag and the seen hints survive —
   * closing a Grow is not the app forgetting who you are.
   */
  const closeGrow = useCallback(async () => {
    if (!pubkey) return;
    await clearProgressFor(pubkey);

    // ⚠️ Written AFTER the wipe, and not among the keys it clears. The ledger is
    // gone, so the day counter would otherwise fall back to the account's own
    // age — which a closure does not move, and which reported "4 days growing"
    // on a Grow that had just started over.
    const now = Date.now();
    setRestartedAt(now);
    await writeJson(keyFor(pubkey, 'restarted'), now);

    setActions([]);
    setUnlocked([STARTED_MILESTONE_ID]);
    setGoalState(null);
    // Pinned to zero rather than left to re-measure: the chain read still
    // carries the pre-withdrawal balance for a moment, and re-pinning from it
    // would resurrect the total that was just closed.
    setRecovered({ owner: pubkey, micro: 0 });
    pinnedFrom.current = pubkey;
  }, [pubkey]);

  const setGoal = useCallback(
    async (milestoneId: string | null) => {
      if (!pubkey) return;
      setGoalState(milestoneId);
      await writeJson(keyFor(pubkey, 'goal'), milestoneId);
    },
    [pubkey],
  );

  const value = useMemo<GrowState>(
    () => ({
      loading,
      pubkey,
      handle,
      actions,
      unlocked,
      grown,
      progress,
      onboarded,
      seenHints,
      goalMilestoneId,
      restartedAt,
      recordAction,
      setHandle,
      completeOnboarding,
      replayOnboarding,
      markHintSeen,
      setGoal,
      closeGrow,
    }),
    [
      loading,
      pubkey,
      handle,
      actions,
      unlocked,
      grown,
      progress,
      onboarded,
      seenHints,
      goalMilestoneId,
      restartedAt,
      recordAction,
      setHandle,
      completeOnboarding,
      replayOnboarding,
      markHintSeen,
      setGoal,
      closeGrow,
    ],
  );

  return <GrowContext.Provider value={value}>{children}</GrowContext.Provider>;
}

export function useGrow(): GrowState {
  const ctx = useContext(GrowContext);
  if (!ctx) throw new Error('useGrow must be used inside <GrowProvider>');
  return ctx;
}
