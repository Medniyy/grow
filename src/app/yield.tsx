import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { TactilePressable } from '../components/ui/TactilePressable';
import { Wheel } from '../components/ui/Wheel';
import { KAMINO_URL, YIELD_EXPLAINER, yieldUnlocked } from '../config/yield';
import { formatUsd } from '../domain/money';
import { MIN_SUPPLY_USD, defaultSupplyIndex, supplyRungs } from '../domain/supplyLadder';
import { fetchUsdcSupplyRate, type ReserveRate } from '../lib/kamino';
import { goBack } from '../lib/nav';
import { useWallet } from '../lib/wallet';
import { useGrowAccount } from '../state/growAccount';
import { useGrow } from '../state/growStore';
import { color, font, radius, space, weight } from '../theme/tokens';

/**
 * Put it to work — where the glowing kept figure on Home leads.
 *
 * The rate, the amount, and one link. ⚠️ NO STANDING WALL OF TEXT: the risk and
 * the mechanics moved inside "How this works" at the user's direction on
 * 2026-09-02, against §7.1's proposal to keep the disclaimer above the button.
 * His reading of the built screen was that a paragraph parked over the one
 * decision buries the decision — see the handoff for the trade that makes.
 *
 * Product design: `docs/PRODUCT-LOOP.md` §7.1.
 */
export default function YieldScreen() {
  const wallet = useWallet();
  const grow = useGrow();
  const growAccount = useGrowAccount();
  const [rate, setRate] = useState<ReserveRate | null>(null);
  const [explained, setExplained] = useState(false);
  /** Null until the user turns the wheel — see `index` below. */
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchUsdcSupplyRate(controller.signal).then(setRate);
    return () => controller.abort();
  }, []);

  // ⚠️ Above the guards, like every other hook. `kept` arrives from the chain
  // after the first paint, so the ladder is rebuilt when it lands.
  const kept = growAccount.kept;
  const rungs = useMemo(() => supplyRungs(kept ?? 0), [kept]);

  if (wallet.status !== 'connected') return <Redirect href="/" />;

  /**
   * A direct URL does not get past the ladder.
   *
   * Below $25 this screen does not exist for the user, and letting a link reveal
   * it would turn the unlock into a formality — the thing was already there, you
   * just had not been told.
   */
  if (!yieldUnlocked(grow.unlocked)) return <Redirect href="/home" />;

  const percent = rate ? `${(rate.supplyApy * 100).toFixed(1)}%` : '—';

  // A balance that arrives late, or shrinks, must never leave the wheel pointing
  // at a rung that no longer exists.
  const index = Math.min(picked ?? defaultSupplyIndex(rungs), Math.max(0, rungs.length - 1));
  const amount = rungs[index]?.micro ?? 0;

  return (
    <Screen scroll>
      <Text style={styles.title}>Put it to work</Text>

      {/* THE RATE, NOT THE PENNIES — the same call Profile already makes. At $25
          the honest annual figure is under a dollar, which reads as "why
          bother" and argues against the thing it is meant to offer. A
          percentage grows with the balance in the reader's head; a small
          absolute number just looks small. */}
      <View style={styles.rateBlock}>
        <Text style={styles.rate}>{percent}</Text>
        <Text style={styles.rateLabel}>a year, on Kamino, right now</Text>
        {rate ? null : (
          // Never load-bearing: a rate we cannot read is simply absent, and the
          // screen still explains itself without it.
          <Text style={styles.rateMissing}>Rate unavailable — check back in a moment.</Text>
        )}
      </View>

      {/* What it would come out of. Stated as what the Grow HOLDS, never as what
          it is earning: nothing here is supplied yet, and a figure phrased as
          earnings would be a lie told by a layout. */}
      {kept !== null ? (
        <Text style={styles.applies}>
          Your Grow holds {formatUsd(kept)}. It is sitting still.
        </Text>
      ) : null}

      {rungs.length > 0 ? (
        <>
          {/* The wheel again, and deliberately not a second kind of control.
              The app has exactly one way to choose an amount; a slider or a
              text field here would make "how much" mean something different on
              this screen than it does on the Grow screen. Rungs come off the
              kept balance and ALL is a rung like anywhere else. */}
          <View style={styles.wheelRow}>
            <Wheel
              label="Amount"
              items={rungs.map((rung) => ({
                key: String(rung.micro),
                label: formatUsd(rung.micro),
                tag: rung.all ? 'ALL' : undefined,
              }))}
              index={index}
              onChange={setPicked}
            />
          </View>

          {/* Directly above the button, so it is in the path of the decision
              rather than filed at the bottom of the screen. */}
          <TactilePressable
            accessibilityRole="button"
            onPress={() => setExplained((open) => !open)}
            style={styles.explainRow}
          >
            <Text style={styles.explainLink}>{explained ? 'Close' : 'How this works'}</Text>
          </TactilePressable>

          {explained ? (
            <View style={styles.explainer}>
              {YIELD_EXPLAINER.map((line) => (
                <Text key={line} style={styles.explainerLine}>
                  {line}
                </Text>
              ))}
              <Button
                variant="ghost"
                label="Read Kamino's own docs"
                onPress={() => void Linking.openURL(KAMINO_URL)}
              />
            </View>
          ) : null}

          <View style={styles.action}>
            <Button label={`Put ${formatUsd(amount)} to work`} disabled />
          </View>
        </>
      ) : (
        <Text style={styles.floor}>
          A Grow needs at least ${MIN_SUPPLY_USD} in it before it is worth putting to work — below
          that, the fee to move it costs more than a year of interest.
        </Text>
      )}

      <View style={styles.spacer} />
      <Button variant="secondary" label="Back" onPress={() => goBack('/home')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...font.xl, fontWeight: weight.semibold, color: color.ink },

  rateBlock: { alignItems: 'center', marginTop: space.xxl },
  rate: { ...font.display, fontWeight: weight.semibold, color: color.ink },
  rateLabel: { ...font.small, color: color.inkFaint, marginTop: space.xs },
  rateMissing: { ...font.small, color: color.inkMuted, marginTop: space.sm },

  applies: { ...font.body, color: color.inkMuted, marginTop: space.xxl, textAlign: 'center' },
  floor: { ...font.small, color: color.inkMuted, marginTop: space.xxl, lineHeight: 20 },

  wheelRow: { flexDirection: 'row', marginTop: space.xl },

  explainRow: { alignSelf: 'center', paddingVertical: space.md },
  explainLink: { ...font.small, fontWeight: weight.semibold, color: color.growthPressed },

  explainer: {
    padding: space.base,
    borderRadius: radius.md,
    backgroundColor: color.sunken,
    gap: space.md,
  },
  explainerLine: { ...font.small, color: color.inkMuted, lineHeight: 20 },

  action: { marginTop: space.lg },

  spacer: { height: space.xl },
});
