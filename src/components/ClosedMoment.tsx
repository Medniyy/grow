import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { formatDays } from '../domain/days';
import { formatUsd, type MicroUsd } from '../domain/money';
import { useFeedback } from '../lib/feedback';
import { color, font, radius, space, weight } from '../theme/tokens';
import { GrowTree } from './GrowTree';

/**
 * Closing a Grow is a finish, not a failure.
 *
 * ⚠️ THE EXIT GETS A MOMENT TOO. Every other ending in this product is
 * celebrated and this one used to happen in silence: the money moved, the
 * ladder emptied, the button vanished, and the last thing the user saw was a
 * screen with nothing on it. That teaches the one lesson a savings app cannot
 * afford — that taking your money out is something the app would rather not
 * discuss.
 *
 * So it says what happened, in full: what came back, what was grown, how long
 * it took, and how many milestones were earned along the way. The plant is
 * shown at the size it reached, because that is the thing being finished.
 */
export function ClosedMoment({
  returnedMicro,
  grownMicro,
  days,
  unlockedCount,
  seed,
  onDone,
}: {
  /** What went back to the wallet. */
  returnedMicro: MicroUsd;
  /** The lifetime total, captured before the ladder was cleared. */
  grownMicro: MicroUsd;
  days: number | null;
  /** Milestones earned, excluding the free seed. */
  unlockedCount: number;
  seed: string;
  onDone: () => void;
}) {
  const feedback = useFeedback();
  const reducedMotion = useReducedMotion();
  const enter = useSharedValue(0);
  const lift = useSharedValue(18);

  useEffect(() => {
    feedback.unlock();
    if (reducedMotion) {
      enter.value = 1;
      lift.value = 0;
    } else {
      enter.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
      lift.value = withDelay(80, withSpring(0, { damping: 17, stiffness: 175, mass: 0.8 }));
    }
    return () => {
      cancelAnimation(enter);
      cancelAnimation(lift);
    };
    // Fired once per mount — this screen exists only for one closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: lift.value }, { scale: 0.94 + enter.value * 0.06 }],
  }));

  const halo = useAnimatedStyle(() => ({
    opacity: enter.value * 0.5,
    transform: [{ scale: 0.75 + enter.value * 0.25 }],
  }));

  const earned = [
    days !== null ? formatDays(days) : null,
    unlockedCount > 0 ? `${unlockedCount} unlocked` : null,
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <Animated.View style={[styles.halo, halo]} />
        <GrowTree grown={grownMicro} seed={seed} size={180} />
      </View>

      <Animated.View style={[styles.card, card]}>
        <Text style={styles.eyebrow}>Complete</Text>
        <Text style={styles.amount}>{formatUsd(returnedMicro)}</Text>
        <Text style={styles.statement}>back in your wallet</Text>

        <Text style={styles.summary}>
          {formatUsd(grownMicro)} grown
          {earned.length > 0 ? ` · ${earned.join(' · ')}` : ''}
        </Text>
        <Text style={styles.footer}>Every cent of it was yours the whole time.</Text>
      </Animated.View>

      <View style={styles.spacer} />

      <Animated.View style={card}>
        <Text accessibilityRole="button" onPress={onDone} style={styles.done}>
          Done
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  stage: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: color.growthSoft,
  },

  card: { alignItems: 'center', marginTop: space.xl },
  eyebrow: {
    ...font.caption,
    fontWeight: weight.semibold,
    color: color.growth,
    textTransform: 'uppercase',
  },
  amount: { ...font.xl, fontWeight: weight.semibold, color: color.ink, marginTop: space.sm },
  statement: { ...font.body, color: color.inkMuted, marginTop: space.xs },

  summary: {
    ...font.small,
    fontWeight: weight.semibold,
    color: color.growthPressed,
    marginTop: space.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.base,
    borderRadius: radius.pill,
    backgroundColor: color.growthSoft,
    overflow: 'hidden',
  },
  footer: { ...font.small, color: color.inkFaint, marginTop: space.md, textAlign: 'center' },

  spacer: { height: space.xxl },
  done: { ...font.body, fontWeight: weight.semibold, color: color.inkMuted, padding: space.md },
});
