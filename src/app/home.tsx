import { Redirect, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CountUp } from '../components/CountUp';
import { EarningsStrip } from '../components/EarningsStrip';
import { KeptButton } from '../components/KeptButton';
import { EmptyState } from '../components/EmptyState';
import { FirstRun } from '../components/FirstRun';
import { GROW_TREE_MAX_ASPECT, GrowTree } from '../components/GrowTree';
import { NavBar } from '../components/NavBar';
import { OpportunityCard } from '../components/OpportunityCard';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { env } from '../config/env';
import { yieldUnlocked } from '../config/yield';
import { daysGrowing, formatDays, growStartedAt } from '../domain/days';
import { formatUsd, usdToMicro } from '../domain/money';
import { pickOpportunity } from '../domain/opportunity';
import { goalProgress } from '../domain/progress';
import { useGrowAccount } from '../state/growAccount';
import { useWallet } from '../lib/wallet';
import { useReconciliation } from '../state/growFlow';
import { useGrow } from '../state/growStore';
import { usePortfolio } from '../state/portfolio';
import { useYieldPosition } from '../state/yieldPosition';
import { color, font, space, weight } from '../theme/tokens';

/**
 * Home — SPEC §7 and §10. The most important screen, and extremely clean:
 * the living object, one number, one next unlock, one dominant action.
 */
export default function HomeScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const portfolio = usePortfolio();
  const growAccount = useGrowAccount();
  const supplied = useYieldPosition();

  // Q3 — chase down anything a previous session left mid-flow.
  useReconciliation();

  /**
   * The plant is sized from the space actually left over, not from a constant.
   *
   * Home does not scroll, so everything has to fit — and what has to fit keeps
   * changing: `kept` and the day count arrive from the chain, the goal line
   * appears once a goal is chosen, the opportunity card's copy changes with the
   * portfolio. A hard-coded height was correct until any one of those landed,
   * and then the opportunity card went under the NavBar.
   *
   * The stage takes `flex: 1`, so its height is whatever the other rows do not
   * use, and the tree is drawn to fit it. Nothing below can be pushed off.
   */
  const [stageHeight, setStageHeight] = useState(TREE_MAX);

  /** The amount under the user's finger, so the bar can show where it lands. */
  const [previewMicro, setPreviewMicro] = useState<number | null>(null);

  /**
   * ⚠️ ABOVE THE EARLY RETURNS, like every other hook here.
   *
   * Memoised so the opportunity card is not handed a freshly built object on
   * every render — the card's selection is keyed by value and survives either
   * way, but a stable input is the fix rather than the workaround. Reads
   * `grow.progress` rather than the destructured `progress` below, which is
   * only in scope after the guards.
   */
  const opportunity = useMemo(
    () =>
      pickOpportunity({
        grown: grow.grown,
        next: grow.progress.next,
        remaining: grow.progress.remaining,
        holdings: portfolio.growable,
      }),
    [grow.grown, grow.progress, portfolio.growable],
  );

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  if (grow.loading) {
    return (
      <Screen>
        <View />
      </Screen>
    );
  }

  // The achievement lands before the number: until this has played once, Home
  // does not render at all, so `$0 grown` is never a new user's first sight.
  if (!grow.onboarded) {
    return (
      <Screen>
        <FirstRun onDone={() => void grow.completeOnboarding()} />
      </Screen>
    );
  }

  const { progress } = grow;
  const days = daysGrowing(
    growStartedAt(grow.actions, growAccount.openedAt, grow.restartedAt),
    Date.now(),
  );
  const goal = goalProgress(grow.grown, grow.goalMilestoneId);
  const atZero = grow.grown === 0;
  const canEarn = yieldUnlocked(grow.unlocked);


  return (
    // One page. The flexible stage above gives up the tree's height so every
    // row below fits, so at the reference size this never scrolls.
    //
    // `scroll fill` rather than a plain fixed screen: `fill` is what lets the
    // stage flex at all inside a scroll container, and the scrolling itself is
    // a floor, not a feature — on a window shorter than the content can be
    // squeezed to, the alternative is silently clipping the one dominant action
    // under the NavBar, which is the failure this screen has already had once.
    <Screen scroll fill footer={<NavBar />}>
      {/* No handle here. `@jcnb` is derived from the pubkey (ADR-002 M2), so at
          the top of Home it means nothing to anyone — it lives on Profile and
          Settings, where it has context and can be edited. */}
      {/* Rehearsal mode has to announce itself. With the mock port the total
          rises and the plant grows while NO money moves and the wallet is never
          touched — indistinguishable from the real thing unless it is said out
          loud, and a money app that silently pretends to move money is the one
          thing this screen must never be. */}
      {env.mockSwap || env.demoMode ? (
        <View style={styles.topRow}>
          <Text style={styles.demoBadge}>
            {env.mockSwap ? 'REHEARSAL · NO REAL MONEY MOVES' : 'DEMO DATA'}
          </Text>
        </View>
      ) : null}

      {/* The sentence sits at the TOP, as the page's own voice, and the money
          sits in the middle band under it. Read the other way round — number
          first, sentence after — the line was a footnote apologising for a $0
          the user had already seen. */}
      {atZero ? (
        <View style={styles.intro}>
          <Text style={styles.introLine}>This is your Grow.</Text>
          <Text style={styles.introLine}>It starts small.</Text>
        </View>
      ) : null}

      <View
        style={styles.stage}
        onLayout={(event) => setStageHeight(event.nativeEvent.layout.height)}
      >
        {/* Sized so that even a FULLY GROWN plant fits the stage. The drawn
            box gets taller as the plant does, and sizing to the width alone
            let the tallest version outgrow the space reserved for it. */}
        <GrowTree
          grown={grow.grown}
          seed={grow.pubkey ?? 'grow'}
          size={Math.max(TREE_MIN, Math.min(TREE_MAX, stageHeight / GROW_TREE_MAX_ASPECT))}
        />
      </View>

      <View style={styles.totals}>
        <CountUp value={grow.grown} style={styles.grown} />
        <Text style={styles.grownLabel}>grown</Text>

        {/* Height is RESERVED, not grown into. Every line in here is waiting on
            a network answer, and letting the block expand as each one lands
            walked the whole screen downward two or three times per load. */}
        <View style={styles.meta}>
          {/* Two states, two numbers, never added together. `available` is what
              is still spendable; `Grow` is what has been kept and now lives in
              a separate on-chain account. */}
          <View style={styles.split}>
            {portfolio.holding !== null ? (
              <Text style={styles.holding}>{formatUsd(portfolio.holding)} available</Text>
            ) : null}
            {growAccount.kept !== null ? (
              <>
                <Text style={styles.splitDot}>·</Text>
                {/* ⚠️ THE CAPABILITY LIVES ON THE FIGURE IT ACTS ON. Yield was
                    first built as a door on Profile and the user rejected it on
                    2026-09-02: Profile is the report, this is the money, and
                    "put this to work" is a sentence about THIS number. Once the
                    rung is earned the kept figure starts glowing and becomes the
                    way in — no new row, no nav entry, nothing added to the one
                    screen in the product that is deliberately bare. */}
                {canEarn ? (
                  <KeptButton
                    kept={growAccount.kept}
                    onPress={() => router.push('/yield')}
                  />
                ) : (
                  <Text style={styles.kept}>{formatUsd(growAccount.kept)} kept</Text>
                )}
              </>
            ) : null}
          </View>

          {/* The one figure that rises without the user spending anything, read
              from the chain so it survives a cleared browser. Quiet on purpose:
              it belongs beside the total, not competing with it. Omitted rather
              than guessed while the chain has not answered. */}
          {/* Only once something has actually grown. "2 days growing" over $0 —
              a Grow that was never started, or one that was just closed —
              counts time that produced nothing. */}
          {days !== null && grow.grown > 0 ? (
            <Text style={styles.days}>{formatDays(days)} growing</Text>
          ) : null}
        </View>
      </View>

      {/* The second half of the free space. With only the stage flexing, every
          spare pixel piled up ABOVE the plant and the money rode at the top of
          the screen; with a flexible gap here too, the split lands the plant
          and the number in the middle band, under the sentence.

          Capped, and it collapses first: on a tall screen the plant keeps the
          larger share, and on a short one this goes to zero before the stage
          gives up anything — the row that must never be squeezed is the one
          below, not this. */}
      <View style={styles.middleGap} />

      {/* A Grow Account we could not READ is not the same as one that does not
          exist, and it must never look like nothing. Silence here is what turned
          a blocked RPC method into "nothing happened at all". */}
      {growAccount.exists === null && growAccount.error ? (
        <View style={styles.openBlock}>
          <Text style={styles.openTitle}>Could not reach your Grow</Text>
          <Text style={styles.openBody}>{growAccount.error}</Text>
          <Button label="Try again" variant="secondary" onPress={growAccount.refresh} />
        </View>
      ) : null}

      {/* The one-time step that makes a Grow real. Until this exists there is
          nowhere for the money to go, and DFlow will not route to it. */}
      {growAccount.exists === false ? (
        <View style={styles.openBlock}>
          <Text style={styles.openTitle}>Open your Grow</Text>
          <Text style={styles.openBody}>
            A separate account, in your own wallet, that only holds what you keep. One signature,
            about $0.21 of rent, once.
          </Text>
          <Button
            label={growAccount.working ? 'Opening…' : 'Open my Grow'}
            disabled={growAccount.working}
            onPress={() => void growAccount.open()}
          />
          {growAccount.error ? <Text style={styles.openError}>{growAccount.error}</Text> : null}
        </View>
      ) : null}

      {progress.next ? (
        <View style={styles.nextBlock}>
          <View style={styles.nextRow}>
            <Text style={styles.nextLabel}>{progress.next.label}</Text>
            {/* A sub-cent gap formats as "$0.00 to unlock", which reads as a
                bug because it looks like nothing is left when something is. */}
            <Text style={styles.nextRemaining}>
              {progress.remaining < usdToMicro(0.01)
                ? 'one Grow away'
                : `${formatUsd(progress.remaining)} to unlock`}
            </Text>
          </View>
          {/* Keyed and started from empty: a new rung fills left to right
              rather than draining back from the old rung's percentage. */}
          <ProgressBar
            key={progress.next.id}
            percent={progress.percentToNext}
            from={0}
            // Where the selected amount would reach. `computeProgress` already
            // clamps the real fill; `ProgressBar` clamps this one, so an amount
            // bigger than the whole rung fills the bar and stops there.
            preview={
              previewMicro === null
                ? undefined
                : (grow.grown + previewMicro) / usdToMicro(progress.next.thresholdUsd)
            }
          />

          {/* The horizon, under the rung. `next` moves every few dollars; the
              goal stays put through twenty of them, which is what a ladder with
              a $500-to-$1,199 gap needs on the days nothing is about to
              unlock. Without this the goal question was a survey: you picked
              iPhone and no screen ever mentioned it again. */}
          {goal && !goal.reached && goal.milestone.id !== progress.next.id ? (
            <Text style={styles.goalLine}>
              Aiming at {goal.milestone.label} · {formatUsd(goal.remaining)} to go
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.complete}>
          <EmptyState
            compact
            title="The ladder is complete"
            body="Serious Stack is unlocked. Your capital stayed with you."
          />
        </View>
      )}

      {/* Under the ladder, and ONLY while a position is live.
          A rail that is always there, dark until you use it, is furniture — and
          on the one screen in the product that is deliberately bare it would
          cost every user something to say nothing. Nobody who has not supplied
          anything ever sees this, so Home is unchanged for them. */}
      {supplied ? <EarningsStrip position={supplied} /> : null}

      <View style={styles.spacer} />

      {/* ⚠️ AN UNREAD WALLET IS NOT AN EMPTY ONE, and the offer must not be
          manufactured out of one. With the chain read failing, `growable`
          arrives empty, the engine finds no source and falls back to a padded
          ask — a card reading "Finish it $1.02" over a wallet the app cannot
          see, next to a block already saying it could not reach the network.
          The Grow screen has drawn this distinction since the 403; Home was
          still guessing. */}
      {portfolio.error ? (
        <EmptyState
          title="Could not read your wallet"
          body="Grow could not reach the network, so it does not know what you hold."
          detail={portfolio.error}
          actionLabel="Try again"
          onAction={portfolio.refresh}
        />
      ) : (
      <OpportunityCard
        opportunity={opportunity}
        onPicked={setPreviewMicro}
        onGrow={(amountMicro, mint) =>
          router.push({
            pathname: '/grow',
            params: {
              ...(amountMicro !== null ? { amount: String(amountMicro) } : {}),
              ...(mint ? { mint } : {}),
            },
          })
        }
      />
      )}
    </Screen>
  );
}

/** The plant never grows past this, and never shrinks into a dot. */
const TREE_MAX = 180;
const TREE_MIN = 96;

/**
 * How far the money block can be pushed below centre-ish before the plant
 * starts paying for it. Past this the extra space is worth more above the
 * plant — a taller plant — than as a bigger hole under the number.
 */
const GAP_MAX = 96;

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  demoBadge: {
    ...font.caption,
    fontWeight: weight.semibold,
    color: color.danger,
    letterSpacing: 1,
  },

  /**
   * `flex: 1` is what makes a non-scrolling Home safe: this box absorbs spare
   * pixels — the larger share of them, next to `middleGap` — and gives them
   * back when a row below needs them.
   *
   * ⚠️ `flex-end` IS LOAD-BEARING. The plant's drawn box grows taller as it
   * grows, and centred it pushed the whole page down every time — the number,
   * the ladder and the one dominant action all walked south as the user saved.
   * Anchored at its root, the soil line stays put and the plant grows UPWARD
   * into space this box was already holding, which is also what a plant does.
   */
  stage: {
    flex: 1,
    minHeight: TREE_MIN,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: space.md,
  },

  totals: { alignItems: 'center', marginTop: space.lg },
  grown: { ...font.display, fontWeight: weight.semibold, color: color.ink },
  grownLabel: { ...font.small, color: color.inkFaint, marginTop: space.xs },
  meta: { alignItems: 'center', minHeight: 60 },
  split: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  holding: { ...font.small, color: color.inkFaint },
  splitDot: { ...font.small, color: color.inkLocked },
  kept: { ...font.small, fontWeight: weight.semibold, color: color.growthPressed },
  days: { ...font.small, color: color.inkFaint, marginTop: space.sm },

  openBlock: { marginTop: space.xl, gap: space.sm },
  openTitle: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  openBody: { ...font.small, color: color.inkMuted, marginBottom: space.xs },
  openError: { ...font.small, color: color.danger },

  // No top margin: it is the first thing on the page, and the stage below it
  // is flexible, so the air between the sentence and the plant is the layout's
  // to hand out rather than a constant's to insist on.
  intro: { alignItems: 'center' },
  introLine: { ...font.md, color: color.inkMuted },

  middleGap: { flexGrow: 1, flexShrink: 1, flexBasis: 0, maxHeight: GAP_MAX },

  nextBlock: { marginTop: space.xl, gap: space.md },
  goalLine: { ...font.small, color: color.inkFaint },
  complete: { marginTop: space.xl },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  nextLabel: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  nextRemaining: { ...font.small, color: color.inkMuted },

  spacer: { height: space.base },
});
