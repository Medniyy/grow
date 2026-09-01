import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AmbientPending } from '../components/AmbientPending';
import { CountUp } from '../components/CountUp';
import { EmptyState } from '../components/EmptyState';
import { GrowMoment } from '../components/GrowMoment';
import { GrowTree } from '../components/GrowTree';
import { Hint } from '../components/Hint';
import { Reveal } from '../components/Reveal';
import { WalletSkeleton } from '../components/LoadingSkeleton';
import { UnlockMoment } from '../components/UnlockMoment';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { Wheel } from '../components/ui/Wheel';
import { HIGH_IMPACT_PCT, PENDING_COPY_SHIFT_MS } from '../config/limits';
import {
  availableMicro,
  defaultAsset,
  defaultRungIndex,
  growable,
  isFalling,
  isRising,
  rungsFor,
} from '../domain/growLadder';
import { formatUsd } from '../domain/money';
import { crossedPercentMarks, milestoneById } from '../domain/progress';
import { useFeedback } from '../lib/feedback';
import { goBack } from '../lib/nav';
import { useWallet } from '../lib/wallet';
import { useGrowFlow } from '../state/growFlow';
import { useGrow } from '../state/growStore';
import { usePortfolio } from '../state/portfolio';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * The Grow screen — SPEC §11. Two questions and one button.
 *
 * ⚠️ NOTHING ELSE BELONGS HERE. This screen was once a swap terminal wearing a
 * savings app's clothes: the milestone and its shortfall across the top, three
 * amount chips, four asset chips each carrying a balance, then the expected
 * output, the guaranteed floor and the unlock promise — nine money figures
 * around a decision with two variables. The ladder is Home's job and the
 * celebration's job; the quote is DFlow's job. Here the user picks how much and
 * out of what, and the only number that matters is on the button.
 */
export default function GrowScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const portfolio = usePortfolio();
  const flow = useGrowFlow();
  const feedback = useFeedback();

  /**
   * What the opportunity on Home already decided.
   *
   * Arriving with both means the user answered "how much" and "out of what"
   * before this screen rendered. Arriving with neither ("Another amount") falls
   * back to the defaults below.
   */
  const params = useLocalSearchParams<{ amount?: string; mint?: string }>();
  const seededAmount = Number(params.amount);
  const seeded = Number.isFinite(seededAmount) && seededAmount > 0 ? seededAmount : null;

  /** Smallest first: dust is what a cleanup action should put under the finger. */
  const sources = useMemo(() => growable(portfolio.growable), [portfolio.growable]);

  const [mint, setMint] = useState<string | null>(params.mint ?? null);
  // A seeded mint too small to fund a Grow falls through to the default rather
  // than selecting an asset with an empty amount wheel.
  const entry = useMemo(
    () => sources.find((e) => e.mint === mint) ?? defaultAsset(sources),
    [sources, mint],
  );

  const rungs = useMemo(
    () => (entry ? rungsFor(availableMicro(entry), seeded) : []),
    [entry, seeded],
  );

  /**
   * The amount is remembered against the asset it was chosen for, never on its
   * own. Each asset has its own ladder, so a bare index would survive a switch
   * and point at the wrong rung — or past the end of a shorter one.
   */
  const [picked, setPicked] = useState<{ mint: string; index: number } | null>(null);
  const amountIndex =
    picked && entry && picked.mint === entry.mint
      ? Math.min(picked.index, rungs.length - 1)
      : defaultRungIndex(rungs, seeded);
  const target = rungs[amountIndex]?.micro ?? 0;

  const assetIndex = Math.max(
    0,
    sources.findIndex((e) => e.mint === entry?.mint),
  );

  useEffect(() => {
    if (entry && target > 0) void flow.requestQuote(target, entry);
    // Re-quoting on every keystroke is what a trading terminal does. This
    // re-quotes when the choice changes, which is when the number can move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.mint, target]);

  // Q9 — the pending state is ambient, never a spinner, and the copy softens
  // if it runs long so the wait never reads as "stuck".
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (flow.phase !== 'pending') {
      setWaitedLong(false);
      return;
    }
    const timer = setTimeout(() => setWaitedLong(true), PENDING_COPY_SHIFT_MS);
    return () => clearTimeout(timer);
  }, [flow.phase]);

  // Captured before executing, so a percent mark fires only on the move that
  // actually crossed it — never on a re-render or a replayed confirmation.
  const grownBefore = useRef(grow.grown);

  const done = flow.phase === 'done';
  useEffect(() => {
    if (done) feedback.grow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  /**
   * The celebration is two beats, and this is the gate between them.
   *
   * `UnlockMoment` is a full-screen overlay. Mounting the progress card
   * underneath it would play its bar animation behind the overlay and reveal a
   * bar that has already finished moving — the movement IS the content, so the
   * second beat waits for the first to hand over.
   */
  const [unlockSettled, setUnlockSettled] = useState(false);

  /**
   * The only quote figure the screen is allowed to react to.
   *
   * "Adds about $1.06 · at least $1.04" is the app thinking out loud. Technical
   * detail earns its place only where the user has a decision to make, and here
   * there is exactly one: a route bad enough that this is the wrong asset to
   * sell. DFlow's own impact figure is the measure — the gap between the app's
   * price feed and the quote is NOT, or every illiquid holding on the wheel
   * would be refused for having a stale price rather than a bad route.
   */
  const impactPct = flow.quote ? Number(flow.quote.priceImpactPct) : null;
  const highImpact =
    impactPct !== null && Number.isFinite(impactPct) && impactPct >= HIGH_IMPACT_PCT;

  /**
   * What the day did to the selected asset — both directions.
   *
   * Said once, by name, and dismissible. It is context, not a refusal, and it
   * never disables the button. Dismissals last the visit: opening the screen
   * again is a new decision.
   */
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const move =
    entry && !dismissed.includes(entry.mint)
      ? isFalling(entry.change24hPct)
        ? ('down' as const)
        : isRising(entry.change24hPct)
          ? ('up' as const)
          : null
      : null;

  const busy =
    flow.phase === 'awaiting-signature' || flow.phase === 'submitting' || flow.phase === 'pending';

  // Home and Collection guard on this and Grow did not, so a direct URL — or a
  // connection that failed — landed here with no wallet, where every screen
  // state is a lie about a wallet that is not there.
  if (wallet.status !== 'connected') return <Redirect href="/" />;

  if (done) {
    // The highest milestone gets the moment; the rest are reported as a count.
    const headline =
      flow.justUnlocked.length > 0
        ? milestoneById(flow.justUnlocked[flow.justUnlocked.length - 1])
        : undefined;

    // What this Grow actually added. Exact, because the recovered part of the
    // total is a pinned constant — see `recoveredMicro`.
    const added = Math.max(0, grow.grown - grownBefore.current);

    // The ladder starves in the middle, so a long rung is broken into arrivals.
    // Computed against the rung being climbed AFTER the Grow, which on an
    // overshoot is the next one up.
    const marks = crossedPercentMarks(grownBefore.current, grow.grown, grow.progress.next);

    // ⚠️ EVERY GROW ENDS IN A MOMENT. A milestone gets the unlock and THEN the
    // progress card for whatever comes next; a Grow that crossed nothing gets
    // the card on its own, immediately. There is no path here that just shows a
    // number and a Done button — that was the state that taught a user their
    // money had produced nothing.
    const showProgress = !headline || unlockSettled;

    // Asked once, and only after something has actually been unlocked.
    const askGoal = Boolean(headline) && !grow.goalMilestoneId;

    return (
      <Screen>
        <View style={styles.celebration}>
          <GrowTree grown={grow.grown} seed={grow.pubkey ?? 'grow'} size={200} />
          <CountUp value={grow.grown} style={styles.big} />
          <Text style={styles.caption}>grown</Text>

        </View>

        {showProgress ? (
          <GrowMoment
            addedMicro={added}
            grownMicro={grow.grown}
            next={grow.progress.next}
            mark={marks.length > 0 ? marks[marks.length - 1] : undefined}
          />
        ) : null}

        {/* The mind-shift the product depends on, said once in a life, at the
            one moment the user is receptive to it. It waits for the overlay to
            hand over — the unlock is a flash, this is a sentence to read. */}
        {headline && unlockSettled ? <Hint id="first-unlock" dismissible={false} /> : null}

        {headline && !unlockSettled ? (
          <UnlockMoment
            milestone={headline}
            alsoUnlocked={flow.justUnlocked.length - 1}
            onDone={() => setUnlockSettled(true)}
          />
        ) : null}

        {askGoal ? (
          <Button
            label="Choose what you are growing toward"
            onPress={() => {
              flow.reset();
              router.replace('/goal');
            }}
          />
        ) : null}

        <Button
          variant={askGoal ? 'ghost' : 'primary'}
          label="Done"
          onPress={() => {
            flow.reset();
            goBack();
          }}
        />
      </Screen>
    );
  }

  if (!entry) {
    return (
      <Screen>
        <Text style={styles.title}>Grow</Text>
        <View style={styles.spacer} />
        {portfolio.loading ? (
          <WalletSkeleton />
        ) : portfolio.error ? (
          // A failed read and an empty wallet are different things, and telling
          // a funded user to "add SOL" when the RPC 403'd sends them hunting in
          // entirely the wrong place.
          <EmptyState
            title="Could not read your wallet"
            body="Grow could not reach the network, so it does not know what you hold."
            detail={portfolio.error}
            actionLabel="Try again"
            onAction={portfolio.refresh}
          />
        ) : (
          <EmptyState
            title="Nothing ready to grow"
            body="Add SOL or another supported token to this wallet, then read it again."
            actionLabel="Read wallet again"
            onAction={portfolio.refresh}
          />
        )}
        <View style={styles.spacer} />
        <Button variant="ghost" label="Cancel" onPress={() => goBack()} />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {flow.error ? (
            <Text style={styles.error} numberOfLines={3}>
              {flow.error}
            </Text>
          ) : null}

          <Button
            label={
              busy
                ? flow.phase === 'awaiting-signature'
                  ? 'Approve in your wallet…'
                  : 'Growing…'
                : `Grow ${formatUsd(target)}`
            }
            disabled={busy || highImpact || target <= 0}
            onPress={() => {
              grownBefore.current = grow.grown;
              void flow.execute(target, entry);
            }}
          />
          <Button variant="ghost" label="Cancel" disabled={busy} onPress={() => goBack()} />
        </>
      }
    >
      <Text style={styles.title}>Grow</Text>

      <View style={styles.wheels}>
        <Wheel
          label="Amount"
          items={rungs.map((rung) => ({
            key: String(rung.micro),
            label: formatUsd(rung.micro),
            tag: rung.all ? 'ALL' : undefined,
          }))}
          index={amountIndex}
          onChange={(index) => setPicked({ mint: entry.mint, index })}
        />
        {/* `name`, not `symbol`: an unlisted mint used to fall back to the first
            four characters of its ADDRESS, so the wallet's Unicorn was offered
            as `UWUy…`. */}
        <Wheel
          label="From"
          // Nudged on arrival: the rows above and below are dim by design, so a
          // still first frame hides the one thing this control has to say —
          // that there are other assets in it.
          nudge
          // Names only. A percentage beside every row turned the wheel into a
          // ticker and truncated the names it exists to show — `Wrapped S…`.
          // The day's move is said once, below, about the asset actually chosen.
          items={sources.map((e) => ({ key: e.mint, label: e.name }))}
          index={assetIndex}
          onChange={(index) => setMint(sources[index]?.mint ?? null)}
        />
      </View>

      {/* ⚠️ A RESERVED SLOT, and the height is the point.
          These messages used to live in the footer, which grows UPWARD — so
          turning the asset wheel from a coin that moved today to one that did
          not shifted the wheels under the user's finger, and dismissing the
          notice shifted them back. The screen has room to spare; a steady
          layout is worth more than the whitespace this costs.

          One message at a time, warning first: if the route is bad enough to
          cost real money, what the day did to the price is not the decision in
          front of the user. */}
      <View style={styles.messageSlot}>
        {highImpact ? (
          // The one place technical detail is allowed: the user has to choose a
          // different asset, and cannot do that without being told why.
          <Reveal duration={420}>
            <View style={styles.warning}>
              <Text style={styles.warningTitle}>High price impact</Text>
              <Text style={styles.warningBody}>
                Selling this much {entry.name} moves its price against you. Try another asset.
              </Text>
            </View>
          </Reveal>
        ) : move && entry ? (
          <Reveal key={entry.mint} duration={420}>
            <View style={[styles.notice, move === 'down' ? styles.noticeFell : styles.noticeRose]}>
              {/* The direction carries a colour and the rest of the sentence
                  does not. Both halves used to be the same ink, so a rise and a
                  fall read identically at a glance and the reader had to parse
                  the word to know which one this was. Accent only — a coloured
                  paragraph would make a remark into a verdict. */}
              <Text style={styles.noticeTitle}>
                {entry.name} is{' '}
                <Text style={move === 'down' ? styles.noticeDownText : styles.noticeUpText}>
                  {move === 'down' ? 'down' : 'up'} {Math.abs(Math.round(entry.change24hPct))}%
                </Text>{' '}
                today
              </Text>
              <Text style={styles.noticeBody}>
                {move === 'down'
                  ? 'Growing from it now locks that in. Another asset may cost you less.'
                  : 'Keeping some of that now is the easiest money you will ever save.'}
              </Text>
              <Text
                accessibilityRole="button"
                onPress={() => setDismissed((seen) => [...seen, entry.mint])}
                style={styles.noticeDismiss}
              >
                Got it
              </Text>
            </View>
          </Reveal>
        ) : null}
      </View>

      {flow.phase === 'pending' ? <AmbientPending long={waitedLong} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...font.lg, fontWeight: weight.semibold, color: color.ink },

  // Centred in whatever space the pinned footer leaves. Anchored at the top
  // instead, the two wheels sat in the upper third under a screen-high void.
  wheels: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.base },

  error: { ...font.small, color: color.danger, marginBottom: space.base },
  /** Tall enough for the longest of the two messages, and never resized. */
  messageSlot: { height: 116, justifyContent: 'flex-end' },
  warning: { gap: space.xs },
  notice: {
    padding: space.base,
    borderRadius: radius.md,
    backgroundColor: color.sunken,
    gap: space.xs,
  },
  /** A rail, not a fill: the colour is a hint at the edge of the block. */
  noticeFell: { borderLeftWidth: 3, borderLeftColor: color.marketDown },
  noticeRose: { borderLeftWidth: 3, borderLeftColor: color.marketUp },
  noticeTitle: { ...font.small, fontWeight: weight.semibold, color: color.ink },
  noticeDownText: { color: color.marketDown },
  noticeUpText: { color: color.marketUp },
  noticeBody: { ...font.small, color: color.inkMuted },
  noticeDismiss: {
    ...font.small,
    fontWeight: weight.semibold,
    color: color.growthPressed,
    marginTop: space.xs,
  },
  warningTitle: { ...font.body, fontWeight: weight.semibold, color: color.danger },
  warningBody: { ...font.small, color: color.inkMuted },

  spacer: { height: space.xxl },

  celebration: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  big: { ...font.display, fontWeight: weight.semibold, color: color.ink },
  caption: { ...font.small, color: color.inkFaint },
});
