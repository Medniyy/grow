import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ClosedMoment } from '../components/ClosedMoment';
import { GROW_TREE_MAX_ASPECT, GrowTree } from '../components/GrowTree';
import { NavBar } from '../components/NavBar';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { daysGrowing, growStartedAt } from '../domain/days';
import { formatUsd, type MicroUsd } from '../domain/money';
import { shortAddress } from '../lib/identity';
import { YIELD_THRESHOLD_USD, yieldUnlocked } from '../config/yield';
import { fetchUsdcSupplyRate, type ReserveRate } from '../lib/kamino';
import { useWallet } from '../lib/wallet';
import { useGrowAccount } from '../state/growAccount';
import { useGrow } from '../state/growStore';
import { usePortfolio } from '../state/portfolio';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * You — the public face of a Grow.
 *
 * Q1 makes this screen carry BOTH numbers. `grown` is a record of what you did
 * and only ever goes up; `holding` is what is in the wallet right now. Showing
 * them together is the whole reason the ledger is allowed to be one-directional:
 * nothing here can read $1,199 grown over an empty wallet without saying so.
 */
export default function ProfileScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const portfolio = usePortfolio();
  const growAccount = useGrowAccount();
  const [rate, setRate] = useState<ReserveRate | null>(null);
  /**
   * Two taps, not a dialog.
   *
   * `Alert` is not implemented by react-native-web, so a confirm that exists
   * only on native would be no confirm at all on the screen this is demoed on.
   */
  const [closing, setClosing] = useState(false);
  /**
   * Captured BEFORE the ladder is cleared. `closeGrow` wipes the total, the
   * unlocks and the recovered figure, so a summary read afterwards would report
   * a Grow of $0 that unlocked nothing.
   */
  const [closed, setClosed] = useState<{
    returned: MicroUsd;
    grown: MicroUsd;
    days: number | null;
    unlocked: number;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsdcSupplyRate(controller.signal).then(setRate);
    return () => controller.abort();
  }, []);

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  if (closed) {
    return (
      <Screen>
        <ClosedMoment
          returnedMicro={closed.returned}
          grownMicro={closed.grown}
          days={closed.days}
          unlockedCount={closed.unlocked}
          seed={grow.pubkey ?? 'grow'}
          onDone={() => setClosed(null)}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll footer={<NavBar />}>
      <View style={styles.header}>
        {/* The drawn box GROWS WITH THE PLANT, so a fixed-size tree with content
            under it walks the whole page downward every time the user saves.
            Home solved this by sizing the tree to a reserved stage; here the
            size is fixed and the stage is reserved against it instead — same
            rule, opposite direction — with the plant anchored at its root so
            the handle never moves. */}
        <View style={styles.treeStage}>
          <GrowTree grown={grow.grown} seed={grow.pubkey ?? 'grow'} size={TREE_SIZE} />
        </View>
        <Text style={styles.handle}>{grow.handle}</Text>
        <Text style={styles.address}>{shortAddress(grow.pubkey ?? '')}</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatUsd(grow.grown)}</Text>
          <Text style={styles.statLabel}>grown</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {portfolio.holding === null ? '—' : formatUsd(portfolio.holding)}
          </Text>
          <Text style={styles.statLabel}>holding</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{grow.unlocked.length}</Text>
          <Text style={styles.statLabel}>unlocked</Text>
        </View>
      </View>

      <Text style={styles.note}>
        Grown counts every dollar you have added through Grow. It never goes down, and it is not the
        same as what you hold today.
      </Text>

      {/* What the capital could be doing — and nothing more.
          ⚠️ NO DOOR HERE. A door on Profile was built and rejected on
          2026-09-02: Profile is the report, and the capability belongs on the
          figure it acts on, which is the kept balance on Home. Once the rung is
          earned this note has done its job and disappears. */}
      {!yieldUnlocked(grow.unlocked) && rate && grow.grown > 0 ? (
        <View style={styles.yield}>
          {/* The RATE, not the pennies. At $25 grown the annual figure is $0.93,
              which reads as "why bother" and argues against the roadmap it is
              meant to sell. A percentage grows with the balance in the reader's
              head; a small absolute number just looks small. */}
          <Text style={styles.yieldTitle}>Next: put it to work</Text>
          <Text style={styles.yieldBody}>
            Your Grow could be earning {(rate.supplyApy * 100).toFixed(1)}% a year on Kamino,
            growing on its own between deposits. Unlocks at ${YIELD_THRESHOLD_USD} grown.
          </Text>
        </View>
      ) : null}

      <View style={styles.spacer} />

      <Button label="Share your Grow" onPress={() => router.push('/share')} />
      <View style={styles.gap} />
      <Button variant="secondary" label="Settings" onPress={() => router.push('/settings')} />
      <View style={styles.gap} />
      <Button variant="ghost" label="Disconnect" onPress={() => wallet.disconnect()} />

      {/* Deliberately last, quiet, and off Home. Savings are not a prison — the
          way out has to exist and be findable — but an exit competing with
          "Grow" on the main screen would be an app arguing against itself. */}
      {grow.grown > 0 ? (
        <View style={styles.closeBlock}>
          {closing ? (
            <>
              <Text style={styles.closeTitle}>Take everything out?</Text>
              <Text style={styles.closeBody}>
                {formatUsd(growAccount.kept ?? 0)} goes back to your wallet, and the ladder starts
                over — every milestone locks again. The money is yours either way.
              </Text>
              <Button
                label={
                  growAccount.working
                    ? 'Taking it out…'
                    : `Take out ${formatUsd(growAccount.kept ?? 0)}`
                }
                disabled={growAccount.working}
                onPress={() => {
                  void (async () => {
                    const amount = BigInt(growAccount.kept ?? 0);
                    // Read while the Grow still exists — see `closed` above.
                    const summary = {
                      returned: Number(amount),
                      grown: grow.grown,
                      days: daysGrowing(
                        growStartedAt(grow.actions, growAccount.openedAt, grow.restartedAt),
                        Date.now(),
                      ),
                      // Minus the free seed, which nobody earned.
                      unlocked: Math.max(0, grow.unlocked.length - 1),
                    };

                    // Nothing on chain to move is not a failure: the local
                    // ladder still needs closing.
                    if (amount > 0n && !(await growAccount.withdraw(amount))) return;
                    await grow.closeGrow();
                    setClosing(false);
                    setClosed(summary);
                  })();
                }}
              />
              <View style={styles.gap} />
              <Button
                variant="ghost"
                label="Keep growing"
                disabled={growAccount.working}
                onPress={() => setClosing(false)}
              />
              {growAccount.error ? (
                <Text style={styles.closeError}>{growAccount.error}</Text>
              ) : null}
            </>
          ) : (
            <Button variant="ghost" label="Close your Grow" onPress={() => setClosing(true)} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}

/** Fixed width for the plant; the stage below reserves its tallest height. */
const TREE_SIZE = 150;

const styles = StyleSheet.create({
  closeBlock: { marginTop: space.xxl, gap: space.sm },
  closeTitle: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  closeBody: { ...font.small, color: color.inkMuted, marginBottom: space.xs },
  closeError: { ...font.small, color: color.danger },

  header: { alignItems: 'center', marginTop: space.base },
  treeStage: {
    height: Math.ceil(TREE_SIZE * GROW_TREE_MAX_ASPECT),
    justifyContent: 'flex-end',
  },
  handle: { ...font.lg, fontWeight: weight.semibold, color: color.ink, marginTop: space.sm },
  address: { ...font.small, color: color.inkFaint, marginTop: 2 },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xxl,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { ...font.md, fontWeight: weight.semibold, color: color.ink },
  statLabel: { ...font.caption, color: color.inkFaint, marginTop: 2 },
  divider: { width: 1, height: 28, backgroundColor: color.border },

  note: { ...font.small, color: color.inkFaint, marginTop: space.lg, lineHeight: 20 },

  yield: {
    marginTop: space.lg,
    padding: space.base,
    borderRadius: radius.md,
    backgroundColor: color.growthSoft,
  },
  yieldTitle: { ...font.small, fontWeight: weight.semibold, color: color.growthPressed },
  yieldBody: { ...font.small, color: color.growthPressed, marginTop: space.xs, lineHeight: 20 },

  spacer: { height: space.xxl },
  gap: { height: space.md },
});
